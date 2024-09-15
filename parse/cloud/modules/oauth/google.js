const { OAuth2Client } = require('google-auth-library')
const fetch = require('node-fetch')
const config = require('../../../config')

const client = new OAuth2Client(config.get('oauth').google.appId)

const getAuthData = async ({ idToken, accessToken }) => {
  if (!idToken || !accessToken) {
    return null
  }
  try {
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: config.get('oauth').google.appId
    })
    const payload = ticket.getPayload()
    // For some reason payload doesn't contain given and family name
    // Though it should according to https://developers.google.com/identity/protocols/OpenIDConnect#obtainuserinfo
    // So making extra request to userinfo
    const profileDataResult = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    })
    if (!profileDataResult.ok) {
      return null
    }
    const profileData = await profileDataResult.json()
    if (payload.sub !== profileData.sub) {
      return null
    }

    return {
      ...payload,
      id: payload.sub,
      first_name: profileData.given_name,
      last_name: profileData.family_name
    }
  } catch (e) {
    console.error(e)
    return null
  }
}

module.exports = getAuthData
