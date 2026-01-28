type SttRequest = {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  on?: {
    (event: 'data', listener: (chunk: Uint8Array) => void): void
    (event: 'end', listener: () => void): void
    (event: 'error', listener: (err: Error) => void): void
    (event: string, listener: (...args: unknown[]) => void): void
  }
}

type SttResponse = {
  status: (code: number) => { json: (data: unknown) => void }
}

type MultipartFile = {
  filename: string
  contentType: string
  data: Buffer
}

const readRequestBody = async (req: SttRequest) => {
  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    req.on?.('data', (chunk: Uint8Array) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    req.on?.('end', () => resolve())
    req.on?.('error', (err: Error) => reject(err))
  })
  return Buffer.concat(chunks)
}

const parseContentDisposition = (value: string) => {
  const result: Record<string, string> = {}
  const parts = value.split(';').map((part) => part.trim())
  for (const part of parts) {
    const [key, rawValue] = part.split('=')
    if (!rawValue) continue
    const cleaned = rawValue.trim().replace(/^"|"$/g, '')
    result[key.trim()] = cleaned
  }
  return result
}

const parseMultipart = (body: Buffer, boundary: string) => {
  const files: Record<string, MultipartFile> = {}
  const fields: Record<string, string> = {}
  const delimiter = Buffer.from(`--${boundary}`)
  let cursor = body.indexOf(delimiter)
  while (cursor !== -1) {
    cursor += delimiter.length
    if (body[cursor] === 45 && body[cursor + 1] === 45) {
      break
    }
    if (body[cursor] === 13 && body[cursor + 1] === 10) {
      cursor += 2
    }
    const next = body.indexOf(delimiter, cursor)
    if (next === -1) break
    let part = body.slice(cursor, next)
    if (part.length >= 2 && part[part.length - 2] === 13 && part[part.length - 1] === 10) {
      part = part.slice(0, -2)
    }
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'))
    if (headerEnd === -1) {
      cursor = next
      continue
    }
    const headersRaw = part.slice(0, headerEnd).toString('utf8')
    const bodyRaw = part.slice(headerEnd + 4)
    const headerLines = headersRaw.split('\r\n')
    const headers: Record<string, string> = {}
    for (const line of headerLines) {
      const sep = line.indexOf(':')
      if (sep === -1) continue
      const name = line.slice(0, sep).trim().toLowerCase()
      const value = line.slice(sep + 1).trim()
      headers[name] = value
    }
    const disposition = headers['content-disposition']
    if (!disposition) {
      cursor = next
      continue
    }
    const details = parseContentDisposition(disposition)
    const fieldName = details.name
    if (!fieldName) {
      cursor = next
      continue
    }
    if (details.filename) {
      files[fieldName] = {
        filename: details.filename,
        contentType: headers['content-type'] || 'application/octet-stream',
        data: bodyRaw
      }
    } else {
      fields[fieldName] = bodyRaw.toString('utf8')
    }
    cursor = next
  }
  return { files, fields }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export default async function handler(req: SttRequest, res: SttResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const token = process.env.SPEECHCORE_API_TOKEN
  const headerName = (process.env.SPEECHCORE_AUTH_HEADER || 'Authorization').trim() || 'Authorization'
  const prefix = (process.env.SPEECHCORE_AUTH_PREFIX || 'Bearer').trim() || 'Bearer'

  if (!token) {
    res.status(400).json({ error: 'Missing SPEECHCORE_API_TOKEN in environment' })
    return
  }

  try {
    const contentTypeHeader = req.headers?.['content-type']
    const contentType =
      Array.isArray(contentTypeHeader) ? contentTypeHeader.join(';') : contentTypeHeader || ''
    if (!contentType.includes('multipart/form-data')) {
      res.status(400).json({ error: 'Expected multipart/form-data' })
      return
    }
    const boundaryMatch = contentType.match(/boundary=([^;]+)/i)
    const boundary = boundaryMatch?.[1]?.replace(/^"|"$/g, '')
    if (!boundary) {
      res.status(400).json({ error: 'Multipart boundary is missing' })
      return
    }

    const bodyBuffer = await readRequestBody(req)
    const { files } = parseMultipart(bodyBuffer, boundary)
    const file = files.file
    if (!file) {
      res.status(400).json({ error: "File not found in field 'file'" })
      return
    }

    const uploadUrl = 'https://speechcoreai.com/api/upload'
    const statusUrl = (taskId: string) => `https://speechcoreai.com/api/transcriptions/${taskId}/status`
    const transcriptionUrl = (taskId: string) => `https://speechcoreai.com/api/transcriptions/${taskId}`
    const authValue = prefix ? `${prefix} ${token}` : token

    const form = new FormData()
    const fileBytes = new Uint8Array(file.data.buffer, file.data.byteOffset, file.data.byteLength)
    const fileBlob = new Blob([fileBytes], { type: file.contentType || 'audio/webm' })
    const outgoingFilename = file.filename || 'recording.webm'
    form.append('file', fileBlob, outgoingFilename)

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        [headerName]: authValue
      },
      body: form
    })
    const uploadText = await uploadResponse.text().catch(() => '')
    let uploadRaw: any = {}
    if (uploadText) {
      try {
        uploadRaw = JSON.parse(uploadText)
      } catch {
        uploadRaw = { message: uploadText }
      }
    }
    if (!uploadResponse.ok) {
      const message =
        typeof uploadRaw?.error === 'string' ? uploadRaw.error : uploadRaw?.message || uploadText
      res
        .status(uploadResponse.status)
        .json({ error: `SpeechCore upload error ${uploadResponse.status}: ${String(message || '').slice(0, 200)}` })
      return
    }
    const taskId = typeof uploadRaw?.task_id === 'string' ? uploadRaw.task_id : ''
    if (!taskId) {
      res.status(502).json({ error: 'SpeechCore did not return task_id' })
      return
    }

    const timeoutMs = 60000
    const pollIntervalMs = 1500
    const startedAt = Date.now()
    let status = 'pending'

    while (Date.now() - startedAt < timeoutMs) {
      const statusResponse = await fetch(statusUrl(taskId), {
        headers: {
          [headerName]: authValue
        }
      })
      const statusText = await statusResponse.text().catch(() => '')
      let statusRaw: any = {}
      if (statusText) {
        try {
          statusRaw = JSON.parse(statusText)
        } catch {
          statusRaw = { message: statusText }
        }
      }
      if (!statusResponse.ok) {
        const message =
          typeof statusRaw?.error === 'string' ? statusRaw.error : statusRaw?.message || statusText
        res.status(statusResponse.status).json({
          error: `SpeechCore status error ${statusResponse.status}: ${String(message || '').slice(0, 200)}`
        })
        return
      }
      status = typeof statusRaw?.status === 'string' ? statusRaw.status : status
      if (status === 'completed' || status === 'failed') {
        break
      }
      await sleep(pollIntervalMs)
    }

    if (status !== 'completed') {
      if (status === 'failed') {
        res
          .status(502)
          .json({ error: 'SpeechCore: transcription failed', task_id: taskId, status })
        return
      }
      res.status(504).json({
        error: 'SpeechCore: transcription timeout',
        task_id: taskId,
        status: 'timeout'
      })
      return
    }

    const transcriptionResponse = await fetch(transcriptionUrl(taskId), {
      headers: {
        [headerName]: authValue
      }
    })
    const transcriptionText = await transcriptionResponse.text().catch(() => '')
    let transcriptionRaw: any = {}
    if (transcriptionText) {
      try {
        transcriptionRaw = JSON.parse(transcriptionText)
      } catch {
        transcriptionRaw = { message: transcriptionText }
      }
    }
    if (!transcriptionResponse.ok) {
      const message =
        typeof transcriptionRaw?.error === 'string'
          ? transcriptionRaw.error
          : transcriptionRaw?.message || transcriptionText
      res.status(transcriptionResponse.status).json({
        error: `SpeechCore transcription error ${transcriptionResponse.status}: ${String(message || '').slice(0, 200)}`
      })
      return
    }

    const segments = Array.isArray(transcriptionRaw?.segments) ? transcriptionRaw.segments : []
    const segmentText = segments
      .map((segment: any) => (segment && typeof segment.text === 'string' ? segment.text.trim() : ''))
      .filter(Boolean)
    let text = segmentText.join('\n')
    if (!text) {
      const fallbackFields = ['text', 'transcript', 'transcription', 'result', 'utterance']
      for (const field of fallbackFields) {
        if (typeof transcriptionRaw?.[field] === 'string') {
          text = transcriptionRaw[field].trim()
          if (text) break
        }
      }
    }

    res.status(200).json({ text, task_id: taskId })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unexpected error' })
  }
}
