const fetch = require('node-fetch')
const crypto = require('crypto')
const config = require('../../../config')

const appSecret = config.get('oauth').facebook.appSecret

function getAppSecretPath (accessToken, appSecret) {
  if (!appSecret) {
    return ''
  }
  const appsecretProof = crypto
    .createHmac('sha256', appSecret)
    .update(accessToken)
    .digest('hex')

  return appsecretProof
}

const getAuthData = async ({ accessToken }) => {
  if (!accessToken) {
    return null
  }
  const url = 'https://graph.facebook.com/me' +
    '?fields=id,first_name,last_name,name,email' +
    `&appsecret_proof=${getAppSecretPath(accessToken, appSecret)}`
  try {
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    })

    if (response.status >= 200 && response.status < 300) {
      return response.json()
    } else {
      return response
    }
  } catch (e) {
    console.error(e)
    return null
  }
}

module.exports = getAuthData
