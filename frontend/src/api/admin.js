import axios from 'axios'

// Deliberately not the shared `client.js` instance: that one auto-attaches
// the chat user's Bearer JWT and has a refresh-on-401 interceptor tied to
// user sessions. The admin token is a separate, unrelated credential.
export const getWorkers = (adminToken) =>
  axios.get('/api/admin/workers', { headers: { 'X-Admin-Token': adminToken } })
