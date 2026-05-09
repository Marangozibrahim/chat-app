import axios from 'axios'
import client from './client'

export function getUploadUrl(roomId, filename, contentType, size) {
  return client.post(`/rooms/${roomId}/upload-url`, {
    filename,
    content_type: contentType,
    size,
  })
}

export function putToS3(uploadUrl, file, onProgress) {
  return axios.put(uploadUrl, file, {
    onUploadProgress: (e) =>
      onProgress?.(Math.round((e.loaded * 100) / e.total)),
  })
}

export function confirmUpload(roomId, objectKey, attachmentUrl, body) {
  return client.post(`/rooms/${roomId}/confirm-upload`, {
    object_key: objectKey,
    attachment_url: attachmentUrl,
    body,
  })
}
