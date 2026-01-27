type SttRequest = {
  method?: string
  body?: unknown
}

type SttResponse = {
  status: (code: number) => { json: (data: unknown) => void }
}

export default async function handler(req: SttRequest, res: SttResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const token = process.env.SPEECHCORE_API_TOKEN
  const url = process.env.SPEECHCORE_TRANSCRIBE_URL
  const authHeader = process.env.SPEECHCORE_AUTH_HEADER

  if (!token || !url) {
    res.status(400).json({
      error: 'Missing SPEECHCORE_API_TOKEN or SPEECHCORE_TRANSCRIBE_URL in environment'
    })
    return
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { audioBase64, mimeType, language, model } = body || {}

    if (!audioBase64 || !mimeType) {
      res.status(400).json({ error: 'audioBase64 and mimeType are required' })
      return
    }

    const buffer = Buffer.from(audioBase64, 'base64')
    const file = new Blob([buffer], { type: mimeType })
    const form = new FormData()
    form.append('file', file, 'audio')
    if (language) form.append('language', language)
    if (model) form.append('model', model)

    const authValue = authHeader ? `${authHeader} ${token}` : `Bearer ${token}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authValue
      },
      body: form
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      res.status(response.status).json({ error: data?.error || data?.message || 'STT request failed', raw: data })
      return
    }

    const text = data?.text ?? data?.result?.text ?? data?.data?.text ?? ''
    res.status(200).json({ text, raw: data })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unexpected error' })
  }
}
