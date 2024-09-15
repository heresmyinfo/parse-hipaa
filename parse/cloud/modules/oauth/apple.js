const appleSignin = require('apple-signin-auth')

const getAuthData = async ({ appleAuthRequestResponse }) => {
  console.log('apple data inner', { appleAuthRequestResponse })
  if (!appleAuthRequestResponse.identityToken) {
    return null
  }

  try {
    const clientId = 'heresmyinfo2'

    const data = await appleSignin.verifyIdToken(appleAuthRequestResponse.identityToken, {
      // audience: clientId,
      ignoreExpiration: true
    })

    console.log('apple data back', data.sub)

    return {
      ...appleAuthRequestResponse,
      id: data.sub,
      email: data.email
      // first_name: profileData.given_name,
      // last_name: profileData.family_name
    }
  } catch (e) {
    console.error('appleVerfify Error', e)
    return null
  }
}

module.exports = getAuthData
