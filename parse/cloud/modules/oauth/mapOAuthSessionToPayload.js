const get = require('../data').get
/**
 * Return idtoken for google
 * @param {string} provider
 * @param {object} data
 */
function mapOAuthSessionToPayload (provider, data) {
  if (!data) {
    return null
  }
  switch (provider) {
    case 'apple' : {
      return {
        appleAuthRequestResponse: get(data, 'access_token'),
        provider
      }
    }
    case 'google': {
      return {
        idToken: get(data, 'raw.id_token'),
        accessToken: get(data, 'access_token'),
        provider
      }
    }
    default: {
      return {
        accessToken: get(data, 'access_token'),
        provider
      }
    }
  }
}

module.exports = mapOAuthSessionToPayload
