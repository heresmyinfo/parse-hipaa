const fetch = require('node-fetch')
var OAuth = require('oauth')

const SocialAccessData = {
  linkedin: {
    accessTokenBaseAPI: 'https://www.linkedin.com/oauth/v2/accessToken',
    getDataBaseAPI: 'https://api.linkedin.com/v1/people/~?format=json',
    clientId: '78lhy2rqa4p6r1',
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    redirectURI: `${process.env.WEB_SERVER_URL}/oauth/linkedin`,
    grantType: 'authorization_code'
  },
  facebook: {
    accessTokenBaseAPI: 'https://graph.facebook.com/v3.3/oauth/access_token',
    getDataBaseAPI: 'https://graph.facebook.com/v3.3/me?fields=id,name,email&format=json',
    clientId: '127860584575676',
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    redirectURI: `${process.env.WEB_SERVER_URL}/oauth/facebook`,
    grantType: 'authorization_code'
  },
  twitter: {
    requestTokenURI: 'https://api.twitter.com/oauth/request_token',
    accessTokenBaseAPI: 'https://api.twitter.com/oauth/access_token',
    getDataBaseAPI: 'https://api.twitter.com/1.1/users/show.json',
    apiKey: 'Su32RjwCoGp1mmdyfTHKvwDeY',
    apiKeySecret: 'Gww4XZtfm8a67aqiM2LuLDEJigxC1sXtyIBPVDeboZlnrtl8Ht',
    userToken: '768777518560096256-jtP5eymKlWztjFLiUH0rudCkccRpZUt',
    userTokenSecret: 'mclPKu58bNibLywH4tL8vz4NS1y0XRI3mk459vgq7Bv8d',
    redirectURI: `${process.env.WEB_SERVER_URL}/oauth/twitter`,
    grantType: 'client_credentials'
  },
  instagram: {
    accessTokenBaseAPI: 'https://api.instagram.com/oauth/access_token',
    getDataBaseAPI: '',
    clientId: '124e7810eac7430898249acfff1385b6',
    clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
    redirectURI: `${process.env.WEB_SERVER_URL}/oauth/instagram`,
    grantType: 'client_credentials'
  },
  apple: {
    accessTokenBaseAPI: 'https://appleid.apple.com/auth/authorize',
    getDataBaseAPI: '',
    clientId: '124e7810eac7430898249acfff1385b6',
    clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
    redirectURI: `${process.env.WEB_SERVER_URL}/oauth/instagram`,
    grantType: 'client_credentials'
  }
}

/**
 * @function getOauthTokenOAuth1
 * @description ouath1.0 based for twitter like accounts to make a 3-legged Oauth. There is the need to grab the auth_token
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.phone - phone
 * @todo
 */
function getOauthTokenOAuth1 (apiKey, userToken, socialNet) {
  const { apiKeySecret, userTokenSecret, accessTokenBaseAPI, requestTokenURI } = SocialAccessData[socialNet]
  var oauth = new OAuth.OAuth(
    requestTokenURI,
    accessTokenBaseAPI,
    apiKey,
    apiKeySecret,
    '1.0A',
    null,
    'HMAC-SHA1'
  )
  var orderedParams = oauth._prepareParameters(
    userToken,
    userTokenSecret,
    'POST',
    requestTokenURI
  )
  console.log('orderedParams', oauth._buildAuthorizationHeaders(orderedParams))
  return fetch(requestTokenURI, {
    method: 'POST',
    headers: {
      Authorization: oauth._buildAuthorizationHeaders(orderedParams)
    }
  })
    .then(response => {
      console.log('getOauthTokenOAuth1: ', response.status)
      if (response.status >= 200 && response.status < 300) {
        return response.text()
      } else { return response }
    })
    .then((response) => {
      console.log('getOauthTokenOAuth1: ', response)
      return response
    })
    .catch(error => {
      console.error('getOauthTokenOAuth1 error: ', error)
      return error
    })
}

function getAccessTokenOAuth1 (oauthVerifier, oauthToken, socialNet) {
  const { accessTokenBaseAPI, redirectURI, grantType, apiKey } = SocialAccessData[socialNet]
  const params = {
    grant_type: grantType,
    oauth_verifier: oauthVerifier,
    oauth_token: oauthToken,
    oauth_consumer_key: apiKey,
    redirect_uri: redirectURI
  }
  let vals = Object.entries(params).map((e) => { return e[1] ? `${e[0]}=${e[1]}` : null }).filter(e => e).join('&')
  // let vals = JSON.stringify(params)
  console.log('getAccessTokenOAuth1 START: ', `${accessTokenBaseAPI}?${vals}`)
  return fetch(`${accessTokenBaseAPI}?${vals}`)
    .then(response => {
      console.log('getAccessTokenOAuth1: ', response.status)
      if (response.status >= 200 && response.status < 300) {
        return response.text()
      } else { return response }
    })
    .then((response) => {
      console.log('getAccessTokenOAuth1: ', response)
      return response
    })
    .catch(error => {
      console.error('getAccessTokenOAuth1 error: ', error)
      return error
    })
}

function getAccessTokenOAuth2 (code, state, socialNet) {
  const { clientId, accessTokenBaseAPI, clientSecret, redirectURI, grantType } = SocialAccessData[socialNet]
  const params = {
    grant_type: grantType,
    code,
    state,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectURI
  }
  let vals = Object.entries(params).map((e) => { return e[1] ? `${e[0]}=${e[1]}` : null }).filter(e => e).join('&')
  // let vals = JSON.stringify(params)
  console.log('getAccessTokenOAuth2 START: ', `${accessTokenBaseAPI}?${vals}`)
  return fetch(`${accessTokenBaseAPI}?${vals}`)
    .then(response => {
      console.log('getAccessTokenOAuth2: ', response.status)
      if (response.status >= 200 && response.status < 300) {
        return response.json()
      } else { return response }
    })
    .then((response) => {
      console.log('getAccessTokenOAuth2: ', response)
      return response
    })
    .catch(error => {
      console.error('getAccessTokenOAuth2 error: ', error)
      return error
    })
}

function getDataOAuth2 (accessToken, socialNet) {
  const { getDataBaseAPI } = SocialAccessData[socialNet]
  console.log('START getData: ', accessToken, socialNet, getDataBaseAPI)
  return fetch(`${getDataBaseAPI}`, {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + accessToken
    }
  })
    .then(response => {
      console.log('getData response: ', response)
      if (response.status >= 200 && response.status < 300) {
        return response.json()
      } else {
        return response
      }
    })
    .then((resp) => resp)
    .catch(error => {
      console.log('getData error: ', error)
      return error
    })
}

function getDataOAuth1 (accessToken, socialNet) {
  const { getDataBaseAPI, apiKey, apiKeySecret, userToken, userTokenSecret, accessTokenBaseAPI, requestTokenURI } = SocialAccessData[socialNet]
  var oauth = new OAuth.OAuth(
    requestTokenURI,
    accessTokenBaseAPI,
    apiKey,
    apiKeySecret,
    '1.0A',
    null,
    'HMAC-SHA1'
  )
  var orderedParams = oauth._prepareParameters(
    userToken,
    userTokenSecret,
    'GET',
    getDataBaseAPI
  )
  console.log('getAccessTokenOAuth1 START: ', oauth._buildAuthorizationHeaders(orderedParams))
  return fetch(`${getDataBaseAPI}?screen_name=nunobbras&accessToken=`, {
    method: 'GET',
    headers: {
      Authorization: oauth._buildAuthorizationHeaders(orderedParams)
    }
  })
    .then(response => {
      console.log('getDataOAuth1 response: ', response)
      if (response.status >= 200 && response.status < 300) {
        return response.json()
      } else {
        return response
      }
    })
    .then((resp) => resp)
    .catch(error => {
      console.log('getDataOAuth1 error: ', error)
      return error
    })
}

// function getDataOAuth1 (accessToken, socialNet) {
//   const { getDataBaseAPI, apiKey } = SocialAccessData[socialNet]
//   console.log('START getDataOAuth1: ', accessToken, socialNet, getDataBaseAPI)
//   const params = {
//     screen_name: 'nunobbras',
//     oauth_consumer_key: apiKey,
//     oauth_token: accessToken
//   }
//   let vals = Object.entries(params).map((e) => { return e[1] ? `${e[0]}=${e[1]}` : null }).filter(e => e).join('&')
//   // let vals = JSON.stringify(params)
//   console.log('getAccessTokenOAuth1 START: ', `${getDataBaseAPI}?${vals}`)
//   return fetch(`${getDataBaseAPI}?${vals}`)
//     .then(response => {
//       console.log('getDataOAuth1 response: ', response)
//       if (response.status >= 200 && response.status < 300) {
//         return response.json()
//       } else {
//         return response
//       }
//     })
//     .then((resp) => resp)
//     .catch(error => {
//       console.log('getDataOAuth1 error: ', error)
//       return error
//     })
// }

function buildResponsePage (data) {
  return (`<html>
          <header>
          </header>
          <body><p>DONE</p>
          <script>
          window.ReactNativeWebView.postMessage('${data}');          
          </script>
          </body>
          </html>`
  )
}

exports.buildResponsePage = buildResponsePage
exports.getOauthTokenOAuth1 = getOauthTokenOAuth1
exports.getAccessTokenOAuth2 = getAccessTokenOAuth2
exports.getAccessTokenOAuth1 = getAccessTokenOAuth1
exports.getDataOAuth2 = getDataOAuth2
exports.getDataOAuth1 = getDataOAuth1
