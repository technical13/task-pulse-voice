import dotenv from 'dotenv'
import express from 'express'
import multer from 'multer'

dotenv.config()
dotenv.config({ path: '.env.local', override: true })

const app = express()
const upload = multer({ storage: multer.memoryStorage() })

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

const getEnvConfig = () => {
  const url = process.env.SPEECHCORE_TRANSCRIBE_URL
  const token = process.env.SPEECHCORE_API_TOKEN
  const header = process.env.SPEECHCORE_AUTH_HEADER || 'Authorization'
  const prefix = (process.env.SPEECHCORE_AUTH_PREFIX || 'Bearer').trim()
  const model = process.env.SPEECHCORE_MODEL
  const language = process.env.SPEECHCORE_LANGUAGE

  if (!url) {
    return { error: 'SPEECHCORE_TRANSCRIBE_URL не задан' }
  }
  if (!token) {
    return { error: 'SPEECHCORE_API_TOKEN не задан' }
  }

  return { url, token, header, prefix, model, language }
}

app.post('/stt', upload.single('file'), async (req, res) => {
  const config = getEnvConfig()
  if ('error' in config) {
    res.status(400).json({ error: config.error })
    return
  }

  const file = req.file
  if (!file) {
    res.status(400).json({ error: "Файл не найден в поле 'file'" })
    return
  }

  try {
    const formData = new FormData()
    const mimeType = file.mimetype || 'audio/webm'
    const normalizedMimeType = mimeType && mimeType.includes('webm') ? 'audio/webm' : mimeType
    const blob = new Blob([file.buffer], { type: normalizedMimeType })
    const outgoingFilename = 'recording.webm'
    formData.append('file', blob, outgoingFilename)

    console.log('SpeechCore upload debug', {
      incomingFilename: file.originalname,
      incomingMimeType: file.mimetype,
      outgoingMimeType: normalizedMimeType,
      outgoingFilename
    })

    const uploadUrl = new URL(config.url)
    if (config.model) {
      uploadUrl.searchParams.set('model', config.model)
    }
    if (config.language) {
      uploadUrl.searchParams.set('language', config.language)
    }

    console.log('SpeechCore auth debug', {
      authHeader: config.header,
      prefix: config.prefix,
      url: uploadUrl.toString()
    })

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        [config.header]: `${config.prefix} ${config.token}`
      },
      body: formData
    })

    const responseText = await response.text().catch(() => '')
    let raw = {}
    if (responseText) {
      try {
        raw = JSON.parse(responseText)
      } catch {
        raw = { message: responseText }
      }
    }

    if (!response.ok) {
      const headers = {}
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'authorization') {
          headers[key] = value
        }
      })
      const bodySnippet = responseText.slice(0, 1000)
      console.error('SpeechCore non-OK', {
        status: response.status,
        headers,
        bodySnippet
      })

      const message = typeof raw?.error === 'string' ? raw.error : raw?.message
      const shortSnippet = (message || responseText || '').slice(0, 200)
      res
        .status(response.status)
        .json({ status: response.status, error: `SpeechCore error ${response.status}: ${shortSnippet}` })
      return
    }

    const taskId = typeof raw?.task_id === 'string' ? raw.task_id : ''
    if (!taskId) {
      res.status(502).json({ error: 'SpeechCore не вернул task_id' })
      return
    }

    const origin = uploadUrl.origin
    const statusUrl = `${origin}/api/transcriptions/${taskId}/status`
    const transcriptionUrl = `${origin}/api/transcriptions/${taskId}`
    const timeoutMs = 60000
    const pollIntervalMs = 1500
    const startedAt = Date.now()
    let status = 'pending'

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

    while (Date.now() - startedAt < timeoutMs) {
      const statusResponse = await fetch(statusUrl, {
        headers: {
          [config.header]: `${config.prefix} ${config.token}`
        }
      })
      const statusText = await statusResponse.text().catch(() => '')
      let statusRaw = {}
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
          .json({ error: 'SpeechCore: распознавание завершилось с ошибкой', task_id: taskId, status })
        return
      }
      res.status(504).json({
        error: 'SpeechCore: превышено время ожидания распознавания',
        task_id: taskId,
        status: 'timeout'
      })
      return
    }

    const transcriptionResponse = await fetch(transcriptionUrl, {
      headers: {
        [config.header]: `${config.prefix} ${config.token}`
      }
    })
    const transcriptionText = await transcriptionResponse.text().catch(() => '')
    let transcriptionRaw = {}
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
      .map((segment) => (segment && typeof segment.text === 'string' ? segment.text.trim() : ''))
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

    res.json({ text, task_id: taskId, status })
  } catch (error) {
    if (error && typeof error === 'object' && 'stack' in error) {
      console.error(error.stack)
    } else {
      console.error(error)
    }
    const message =
      error && typeof error === 'object' && 'message' in error ? error.message : 'Неизвестная ошибка'
    res.status(500).json({ error: message })
  }
})

const port = 8787
app.listen(port, () => {
  console.log(`STT proxy server is running on http://localhost:${port}`)
})
