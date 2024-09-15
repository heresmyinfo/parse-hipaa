const nanoid = require('nanoid/async')
const getOAuthData = require('./modules/oauth/index')
const Property = require('./property')
const User = require('./user')

class SocialLogin extends Parse.Object {
  constructor () {
    super('SocialLogin')
  }

  /**
   * Get user linked to oauth provider account
   * @param {string} provider
   * @param {string} id
   */
  static async getUserByProvider (provider, id) {
    const query = new Parse.Query('SocialLogin')
    query.equalTo('providerName', provider)
    query.equalTo('providerId', id)
    query.include('user')
    query.include('user.profile')
    query.include('user.profile.properties')
    const oauth = await query.first({ useMasterKey: true })
    console.log('------ oauth ------', oauth)
    if (oauth) {
      console.log('------ oauth.get(user) ------', oauth.get('user'))
      return oauth.get('user')
    }
    return null
  }
}
Parse.Object.registerSubclass('SocialLogin', SocialLogin)

module.exports = SocialLogin

/**
 * 1. Get OAuth data from provider by access token or id token
 * 2. Check if there is already linked user to this provider. return user token if found
 * 3. If user logged in (request.user) - link and add email, return user session token
 * 4. Check if there is a user with verified email equals to oauth email. link and return user token if found
 * 5. Check if there is a user with Primary non-verified email equals to oauth email. Mark as verified, link and return user token if found
 * 6. Create new user with oauth data, set email verified, return user token
 */
Parse.Cloud.define('loginWith', async function (request, response) {
  // const user = request.user
  const { provider, payload, hasAccount, validSocialLogins } = request.params

  console.log('loginwith request: ', request)
  console.log(
    'PROVIDER!: ', provider,
    'hasAccount', hasAccount,
    'validSocialLogins count', validSocialLogins.length)

  // Creates and returns Parse token
  const returnUserToken = async (user) => {
    console.log('user', user)
    const token = await user.createSessionToken({ createdWith: { authProvider: provider } })
    console.log('returnUserToken token: ', token)
    return response.success({ token })
  }

  try {
    // 1. Get OAuth data from provider by access token or id token (in payload)
    console.log('STEP 1: Get OAuth data.')

    const oAuthData = await getOAuthData(provider, payload)
    console.log('socialLogin oAuthdata: ', oAuthData)
    if (!oAuthData || !oAuthData.email || !oAuthData.id) {
      return response.error(400, 'Auth error')
    }

    const linkUser = async (user) => {
      const link = new SocialLogin()
      link.set('providerName', provider)
      link.set('providerId', oAuthData.id)
      link.set('user', user)
      link.setACL(new Parse.ACL())
      await link.save(null, { useMasterKey: true })
    }

    // Check if email for user is verified, if not, set it to TRUE (verified)
    // Because user just proved it using social account
    const verifyEmail = async (user) => {
      console.log('VERIFYEMAIL ')
      const property = user.get('profile').get('properties').find(p =>
        p.get('name') === 'emailAddresses' &&
        p.get('parameters')[1].value === oAuthData.email &&
        p.get('verified') !== true
      )
      console.log('VERIFYEMAIL property: ', property)
      if (property) {
        await property.save('verified', true, { useMasterKey: true })
      }
    }

    // 2. Check if there is already linked user to this provider. return user token if found
    console.log('STEP 2: Check if SocialLogin record exists.')
    let user = await SocialLogin.getUserByProvider(provider, oAuthData.id)
    if (user) {
      console.log('SOCIALLOGIN USER FOUND', user)
      await verifyEmail(user)
      // User account exists in SocialLogin - no need to continue, RETURNS user token
      return await returnUserToken(user)
    }

    // @todo 3
    // console.log('STEP 3. Not defined yet. Skipping.')
    // need to return to click

    // 4. Check if there is a user with verified email equals to oauth email.
    // create SocialLogin link and return user token if found
    console.log('STEP 4: Check if this account is already verified in existing Parse account.')

    const emailProperty = await Property.getPropertyByParameterValue(oAuthData.email, 'emailAddresses', true)
    if (emailProperty) {
      console.log(`STEP 4 email: ${oAuthData.email} EXISTS in Parse`)
      user = await User.getUserbyProperty(emailProperty)
      console.log('Step 4 Parse user: ', user)
      if (user) {
        // Creates SocialLogin record for this user
        await linkUser(user)
        // creates SocialLogin record and RETURNS user token (stops here)
        return await returnUserToken(user)
      } else {
        console.log(`STEP 4 email: ${oAuthData.email} does NOT exist in Parse`)
        console.error(`No user data: no user found for existing email ${oAuthData.email}, property id ${emailProperty.id}`)
        return response.error(404, {
          email: oAuthData.email,
          name: oAuthData.name,
          provider
        })
      }
    }

    // 5. Check if there is a user with Primary verified email equals to oauth email.
    // Link and return user token if found

    console.log('STEP 5: ')
    const userQuery = new Parse.Query(Parse.User)
    userQuery.equalTo('email', oAuthData.email)
    userQuery.include('profile')
    userQuery.include('profile.properties')
    // add query for 'verified'
    const PropertyQuery = new Parse.Query('Property')
    PropertyQuery.equalTo('name', oAuthData.email)
    user = await userQuery.first({ useMasterKey: true })
    // Should login whether or not I 'have an account' (hasAccount)
    if (user) {
      await linkUser(user)
      return await returnUserToken(user)
    }
    // Should bypass 404 if I think I'm a new user and user does not exist
    if (!user && hasAccount) {
      return response.error(404, {
        email: oAuthData.email,
        name: oAuthData.name,
        provider
      })
    }

    console.log('STEP 6: Create new user if user does not have an account (is signing up)')

    // 6. Create new user with oauth data, set email verified, return user token
    user = await Parse.Cloud.run('createUserWithProfile', {
      givenName: oAuthData.first_name || '-',
      familyName: oAuthData.last_name || '-',
      email: oAuthData.email,
      username: oAuthData.email,
      password: await nanoid()
    })
    const userReloadQuery = new Parse.Query(Parse.User)
    userReloadQuery.include('profile')
    userReloadQuery.include('profile.properties')
    user = await userReloadQuery.get(user.id, { useMasterKey: true })
    if (user) {
      await linkUser(user)
      await verifyEmail(user)
      // await handleOtherVerifiedLogins(user, validSocialLogins)
      return await returnUserToken(user)
    }
    return response.error(400, 'Auth error')
  } catch (error) {
    return response.error(error)
  }
})
