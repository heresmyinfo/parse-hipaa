/* global Parse */

var Property = require('./property.js')
const Profile = require('./profile')
const mp = require('./mix.js')
const isAdminOrFail = require('./administration').isAdminOrFail
const validateEmail = require('./modules/validation').validateEmail
const Mailgun = require('mailgun-js')({ apiKey: process.env.MAILGUN_KEY, domain: process.env.MAILGUN_DOMAIN })
const fetch = require('node-fetch')
const addYears = require('date-fns/addYears')
const bcrypt = require('bcrypt')
const config = require('../config.js')
const Message = require('./message')
const randomHexString = require('./modules/data').randomHexString

Parse.User.allowCustomUserClass(true)

class CustomUser extends Parse.User {
  constructor() {
    super('_User')
    this.createSessionToken = this.createSessionToken.bind(this)
  }

  /**
   * Get session token
   * Allows the user to become authenticated
   * Used for social auth and email login
   */
  async createSessionToken(
    { createdWith } = {}
  ) {
    const token = 'r:' + randomHexString(32)
    const sessionData = {
      sessionToken: token,
      user: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.id
      },
      createdWith,
      restricted: false,
      expiresAt: {
        __type: 'Date',
        iso: addYears(new Date(), 1).toJSON()
      }
    }

    await fetch(
      `${config.get('parse').serverURL}/classes/_Session`,
      {
        headers: {
          'x-parse-application-id': config.get('parse').appId,
          'x-parse-master-key': config.get('parse').masterKey
        },
        body: JSON.stringify(sessionData),
        method: 'POST'
      })

    return token
  }
}

Parse.Object.registerSubclass('_User', CustomUser)

Parse.User.prototype.sessionOptions = function () {
  return { sessionToken: this.getSessionToken() }
}

/**
 * @function fetchUser
 * @description fetch a user given a user Id
 * @todo
 */
exports.fetchUser = function (userID) {
  var query = new Parse.Query(Parse.User)
  return query.get(userID, { useMasterKey: true })
}

/**
 * @function getUserbyProperty
 * @description get a user given a property obj
 * @todo
 */
function getUserbyProperty(property) {
  const queryProfile = new Parse.Query('Profile')
  queryProfile.equalTo('properties', property)
  return queryProfile
    .include('user')
    .first({ useMasterKey: true })
    .then((profile) => {
      const userQuery = new Parse.Query(Parse.User)
      userQuery.equalTo('profile', profile)
      return userQuery.first({ useMasterKey: true })
    })
    .then((user) => {
      if (user) {
        return user
      } else {
        return false
      }
    })
    .catch((error) => {
      console.log('exports.getUserbyProperty failed: ' + error)
      return error
    })
}
exports.getUserbyProperty = getUserbyProperty

/**
 * @function getFullName
 * @description
 * @todo Warning - this could/should be changed to props instead of profile name??
 */
Parse.User.prototype.getFullName = function () {
  const userQuery = new Parse.Query(Parse.User)
  userQuery.include('profile')
  userQuery.include('profile.properties')
  return userQuery.get(this.id, { useMasterKey: true })
    .then((user) => {
      let givenName, lastName
      user.get('profile').get('properties').forEach((prop) => {
        if (prop.get('name') === 'givenName') {
          givenName = prop.get('value')
        }
        if (prop.get('name') === 'familyName') {
          lastName = prop.get('value')
        }
      })
      return `${givenName} ${lastName}`
    })
    .catch((e) => {
      console.log('error getting full name ', e)
      return e
    })
}

/**
 * @function getGivenName
 * @description
 * @todo Warning - this could/should be changed to props instead of profile name??
 */
Parse.User.prototype.getGivenName = function () {
  const userQuery = new Parse.Query(Parse.User)
  userQuery.include('profile')
  userQuery.include('profile.properties')
  return userQuery.get(this.id, { useMasterKey: true })
    .then((user) => {
      user.get('profile').get('properties').forEach((prop) => {
        if (prop.get('name') === 'givenName') {
          return prop.get('value')
        }
      })
    })
    .catch((e) => {
      console.log('error getting full name ', e)
      return e
    })
}

/**
 * @function getFamilyName
 * @description
 * @todo Warning - this could/should be changed to props instead of profile name??
 */
Parse.User.prototype.getFamilyName = function () {
  const userQuery = new Parse.Query(Parse.User)
  userQuery.include('profile')
  userQuery.include('profile.properties')
  return userQuery.get(this.id, { useMasterKey: true })
    .then((user) => {
      user.get('profile').get('properties').forEach((prop) => {
        if (prop.get('name') === 'familyName') {
          return prop.get('value')
        }
      })
    })
    .catch((e) => {
      console.log('error getting full name ', e)
      return e
    })
}

/**
 * @function findUser
 * @description find a user from email or phone - phone should be E.164
 * @param {string} username
 * @param {string} email
 * @param {string} E164
 * @todo This should be used in e.g. invite.js in invitePerson and canInvite
 */
exports.findUser = function (username, email, E164) {
  let verified, foundProperty
  var promise = new Parse.Promise()
  var myPromise = new Parse.Promise()

  if (username) {
    const query = new Parse.Query(Parse.User)
    query.equalTo('username', username)
    myPromise = query.first({ useMasterKey: true })
  }
  if (email) {
    myPromise = Property.getPropertyByParameterValue(email, 'emailAddresses', false)
      .then((property) => {
        console.log('getPropertyByParameterValue email property', property)
        if (property) {
          foundProperty = property
          verified = property.get('verified')
          return exports.getUserbyProperty(property)
        }
        return null
      })
  }

  if (E164) {
    myPromise = Property.getPropertyByParameterValue(E164, 'phoneNumbers', false)
      .then((property) => {
        console.log('getPropertyByParameterValue phone property', property)
        if (property) {
          foundProperty = property
          verified = property.get('verified')
          return exports.getUserbyProperty(property)
        }
        return null
      })
  }

  console.log('username, email, E164', username, email, E164)
  if (username || E164 || email) {
    myPromise
      .then(
        function (user) {
          if (!foundProperty) {
            return promise.resolve({ user: false })
          }
          if (user) {
            console.log('user found', user)
            return promise.resolve({ user, verified })
          }
          console.log('No user, cleaning up the property')
          // If property is not attached to any user, we need to delete it
          return foundProperty.destroy({ useMasterKey: true }).then(() => promise.resolve({ user: false }))
        },
        function (error) {
          console.log('error', error)
          promise.reject(error)
        }
      )
  } else {
    console.log('Missing username, email and phone')
    promise.reject('Missing username, email and phone')
  }

  return promise
}

/**
 * @function userExists
 * @description [usage MOBILE] find a user from email or phone - phone should be E.164
 * @description [usage WEB] find a user from email or phone - phone should be E.164
 * @kind Cloud Function
 * @param {string} username
 * @param {string} email
 * @param {string} E164
 * @todo This should be used in e.g. invite.js in invitePerson and canInvite
 */
Parse.Cloud.define('userExists', function (request, response) {
  console.log('userExists called ', request.params)
  // the master key was being used when we called this function before signup or login
  var E164 = request.params.E164

  exports.findUser(request.params.username, request.params.email, E164).then(
    function (data) {
      console.log('XXXXXXX WITH USER?', data)
      response.success({ resp: !!data.user, ...data })
    },

    function (error) {
      response.error(error)
    }
  )
})

/**
 * @function getNotifsForUser
 * @description [usage MOBILE] pulling system basic function - get data for a certain user based on "data availability" flags.
 *  No params, based on user session
 * @kind Cloud Function
 * @todo This should be used in e.g. invite.js in invitePerson and canInvite
 *  the master key was being used when we called this function before signup or login - confirm consequences
 */
Parse.Cloud.define('getNotifsForUser', function (request, response) {
  // console.log('getNotifsForUser called', request.params, request.user, request.user ? request.user.get('id') : null)
  if (request.user) {
    const query = new Parse.Query(Parse.User)
    query.equalTo('objectId', request.user.id)
    query.first({ sessionToken: request.user.getSessionToken() })
      .then((thisUser) => {
        if (thisUser) {
          if (thisUser.get('newInvitationsFlag') || thisUser.get('newConnectionsFlag') || thisUser.get('profileUpdatedFlag')) {
            console.log('XXXXXXXXXXXXXXX  DATA AVAILABLE  XXXXXXXXXXXXXXXXXXX')
          }
          response.success({ newInvitationsFlag: thisUser.get('newInvitationsFlag'), newConnectionsFlag: thisUser.get('newConnectionsFlag'), profileUpdatedFlag: thisUser.get('profileUpdatedFlag') })
          thisUser.set('newInvitationsFlag', false)
          thisUser.set('newConnectionsFlag', false)
          thisUser.set('profileUpdatedFlag', false)
          thisUser.save(null, { useMasterKey: true })
        }
      })
      .catch((error) => {
        response.error('getNotifsForUser Error ', error)
      })
  }
})

/**
 * @function qrrequestCheck
 * @description [usage MOBILE] is there any user with this QR code
 *  No params, based on user session
 * @kind Cloud Function
 * @todo
 */
Parse.Cloud.define('qrrequestCheck', function (request, response) {
  console.log('qrrequestCheck called', request.params)
  let thisUser
  const query = new Parse.Query(Parse.User)
  query.equalTo('QRCode', request.params.qrcode)
  query.include('QRcircleId')
  query.include('QRcircleId.properties')
  query.first({ useMasterKey: true })
    .then((usr) => {
      thisUser = usr
      return thisUser.getFullName()
    })
    .then((username) => {
      console.log('thisUser', username, thisUser, thisUser.get('QRcircleId'))
      const notSend = ['x-socialprofile']
      const newProps = thisUser.get('QRcircleId').get('properties').filter((prop) => {
        console.log('prop', prop.get('name'), notSend.indexOf(prop.get('name')))
        return (notSend.indexOf(prop.get('name')) === -1)
      })
      return response.success({ name: username, QRcircle: newProps })
    })
    .catch((error) => {
      response.error('qrrequestCheck Error', error)
    })
})

/**
 * @function inactivateUser
 * @description used on admin page - turn a user inactive using the user id
 * @kind Cloud Function
 * @param {string} id - user id
 */
Parse.Cloud.define('inactivateUser', async function (request, response) {
  try {
    if (!isAdminOrFail(request, response)) {
      return null
    }
    const userId = request.params.id
    const query = new Parse.Query(Parse.User)
    const thisUser = await query.get(userId, { useMasterKey: true })
    const acl = new Parse.ACL()
    acl.setPublicReadAccess(false)
    acl.setPublicWriteAccess(false)
    thisUser.setACL(acl)
    thisUser.set('active', false)
    await thisUser.save(null, { useMasterKey: true })
    // Remove sessions
    const sessionsQuery = new Parse.Query(Parse.Session)
    sessionsQuery.equalTo('user', thisUser)
    const sessions = await sessionsQuery.find({ useMasterKey: true })
    await Parse.Object.destroyAll(sessions, { useMasterKey: true })

    return response.success({})
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function activateUser
 * @description used on admin page - turn a user active using the user id
 * @kind Cloud Function
 * @param {string} id - user id
 */
Parse.Cloud.define('activateUser', async function (request, response) {
  try {
    if (!isAdminOrFail(request, response)) {
      return null
    }
    const userId = request.params.id
    const query = new Parse.Query(Parse.User)
    const thisUser = await query.get(userId, { useMasterKey: true })
    const acl = new Parse.ACL()
    acl.setPublicReadAccess(true)
    acl.setPublicWriteAccess(true)
    thisUser.setACL(acl)
    thisUser.set('active', true)
    await thisUser.save(null, { useMasterKey: true })
    return response.success({})
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function anyLogin
 * @description [usage MOBILE] not used yet - use any email i your profile to login
 * @kind Cloud Function
 * @param {string} email
 * @param {string} password
 * @todo
 */
Parse.Cloud.define('anyLogin', async (request, response) => {
  console.log('anyLogin called', request.params)
  const email = request.params.email
  const password = request.params.password
  const returnUserToken = async (user) => {
    const token = await user.createSessionToken({ createdWith: { authProvider: 'credentials' } })
    return response.success({ token })
  }
  try {
    // Check if there is a user with Primary email
    const userQuery = new Parse.Query(Parse.User)
    userQuery.equalTo('email', email)
    const user = await userQuery.first({ useMasterKey: true })
    if (user) {
      await Parse.User.logIn(user.get('email'), password)
      console.log('XXXuser', user)
      return await returnUserToken(user)
    }

    // Check if there is a user with verified email
    const emailProperty = await Property.getPropertyByParameterValue(email, 'emailAddresses', true)
    if (emailProperty) {
      const user = await getUserbyProperty(emailProperty)
      if (user) {
        await Parse.User.logIn(user.get('email'), password)

        return await returnUserToken(user)
      } else {
        console.error(`Corrupted user data: no user found for existing email ${email}, property id ${emailProperty.id}`)
        return response.error(400, 'Invalid credentials')
      }
    }

    return response.error(400, 'Invalid credentials')
  } catch (error) {
    return response.error(400, 'Invalid credentials')
  }
})

/**
 * @function checkVerifiedEmail
 * @description [usage MOBILE] get Email Verification Status
 * @kind Cloud Function
 * @param {string} email
 * @todo
 */
Parse.Cloud.define('checkVerifiedEmail', async (request, response) => {
  if (!request.user) {
    return response.error('Must be logged in to call checkVerifiedEmail.')
  }

  const email = request.params.email

  try {
    const property = await Property.getPropertyByParameterValue(email, 'emailAddresses', true, request.user)
    if (property) {
      const uQuery = new Parse.Query(Parse.User)
      uQuery.include('profile.properties')
      const user = await uQuery.get(request.user.id, request.user.sessionOptions())
      return response.success(user)
    }
    response.success(false)
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function beforeSave
 * @description set a number of default pending connnections to 10
 * @todo
 */
Parse.Cloud.beforeSave(Parse.User, function (request, response) {
  if (!request.object.get('defaultPendingConns')) {
    request.object.set('defaultPendingConns', 10)
  }
  response.success()
})

/**
 * @function initPasswordRecovery
 * @description [usage WEB] init password recovery process, send email with details
 * @kind Cloud Function
 * @param {string} email
 */
Parse.Cloud.define('initPasswordRecovery', async function (request, response) {
  const email = request.params.email
  if (!email) {
    return response.error('Email required')
  }
  try {
    let { user } = await exports.findUser(null, request.params.email)
    if (!user) {
      const emailProperty = await Property.getPropertyByParameterValue(email, 'emailAddresses', true)
      if (emailProperty) {
        user = await getUserbyProperty(emailProperty)
        if (!user) {
          // User was not found, return "success" to avoid brutforcing user db
          return response.success({ sent: true })
        }
      }
    }

    const query = new Parse.Query(Parse.User)
    query.include('profile')
    query.include('profile.properties')
    user = await query.get(user.id, { useMasterKey: true })

    const res = await Message.sendPasswordRecoveryEmail(user, email)
    if (!res) {
      return response.error('Could not send recovery email, plese try again later')
    }
    response.success({ sent: true })
  } catch (err) {
    return response.error(err)
  }
})

/**
 * @function finishPasswordRecovery
 * @description [usage WEB] init password recovery process, send email with details
 * @kind Cloud Function
 * @param {string} messageId
 * @param {string} token
 * @param {string} newPassword
 */
Parse.Cloud.define('finishPasswordRecovery', async function (request, response) {
  const { newPassword, messageId, token } = request.params
  if (!newPassword) {
    return response.error('Please provide new password')
  }
  if (token === '') {
    return response.error('Invalid token')
  }
  try {
    const message = await Message.fetchMessage(null, messageId)
    if (!message) {
      return response.error('Invalid token')
    }
    const tokenValid = await bcrypt.compare(token, message.get('data'))
    if (message.get('kind') !== 'passwordRecovery' || !tokenValid) {
      return response.error('Invalid token')
    }
    const user = message.get('toPerson')
    user.set('password', newPassword)
    await user.save(null, { useMasterKey: true })
    // Clean the token so the link won't remain active
    await message.save('data', '', { useMasterKey: true })

    response.success({ success: true })
  } catch (err) {
    return response.error(err)
  }
})

exports.pushToUser = function (toUser, data) {
}

/**
 * @function createUserWithProfile
 * @description [usage WEB] sign up user and create the profile; rollback saved data if something goes wrong
 * @description [usage Mobile] sign up user and create the profile; rollback saved data if something goes wrong
 * @kind Cloud Function
 * @param {string} username
 * @param {string} password
 * @param {string} email
 * @param {string} phone
 * @param {string} countryCode
 * @param {string} givenName
 * @param {string} familyName
 * @param {string} delimiter
 * @param {string} workEmail
 * @param {string} workPhone
 * @param {bool} skipEmailVerification
 */
Parse.Cloud.define('createUserWithProfile', async function (request, response) {
  const { givenName, familyName, delimiter, email, workEmail, workPhone, phone, countryCode, username, password } = request.params
  if (!givenName || !familyName || !email || !username || !password) {
    return response.error('Must have at minimum an email, givenName, familyName, username, password')
  }
  if (phone && !countryCode) {
    return response.error('Must have countryCode when phone is provided to create a Profile.')
  }
  if (!validateEmail(email)) {
    return response.error('Email is invalid')
  }
  const user = new Parse.User()
  user.set('username', username)
  user.set('password', password)
  user.set('email', email)
  user.set('phone', phone)
  if (phone) {
    user.set('E164', phone)
  }

  try {
    await user.signUp()
  } catch (error) {
    return response.error(error)
  }

  let profile
  mp.track('createProfile', user.id)
  try {
    profile = await Profile.createNewProfile(user, givenName, familyName, delimiter, email, phone, countryCode, workEmail, workPhone)
  } catch (error) {
    // Cleanup user if couldn't create profile
    await user.destroy({ useMasterKey: true })
    return response.error(error)
  }

  try {
    user.set('profile', profile)
    // Setting ACL to user to make him not publicly-readable
    user.setACL(new Parse.ACL(user))
    await user.save(null, { useMasterKey: true })
  } catch (error) {
    // Cleanup profile and user if couldn't set profile to user
    await user.destroy({ useMasterKey: true })
    await profile.destroy({ useMasterKey: true })
    return response.error(error)
  }

  response.success(user)

  try {
    // Send email notification
    const html = `
    <h1>New HMI User just signed up!</h1>
    <p><strong>Name:</strong> ${givenName} ${familyName}</p>
    <p><strong>Email:</strong> ${email}</p>
    `
    const mailData = {
      to: 'admin@heresmyinfo.com',
      from: 'HeresMyInfo <noreply@heresmyinfo.com>',
      subject: 'New HMI user just signed up!',
      html
    }
    if (request.params.skipEmailVerification !== true) {
      await Mailgun.messages().send(mailData)
    }
  } catch (error) { }
})

/**
 * @function beforeDelete
 * @description Don't allow user deletion if he has business
 */
Parse.Cloud.beforeDelete(Parse.User, function (request, response) {
  const user = request.object
  const businesses = user.get('businesses')
  if (businesses && businesses.length > 0) {
    return response.error(`You can not delete user with id ${user.id} because he has a business`)
  }
  response.success()
})

/**
 * @function initUserDeletion
 * @description [usage Web] init user deletion process
 * @kind Cloud Function
 * @param {string} email
 */
Parse.Cloud.define('initUserDeletion', async (request, response) => {
  try {
    if (!request.user) {
      return response.error(401, 'Must be logged in to delete a user.')
    }

    const { email } = request.params
    if (!email) {
      return response.error(400, 'You must provide the email to delete a user.')
    }

    const emailProperty = await Property.getPropertyByParameterValue(email, 'emailAddresses', true)
    if (!emailProperty) {
      return response.error(400, 'You must provide verified email to delete a user.')
    }
    const user = await getUserbyProperty(emailProperty)

    if (!user) {
      console.error(`Corrupted user data: no user found for existing email ${email}, property id ${emailProperty.id}`)
      return response.error(400, 'Server error')
    }

    if (user.id !== request.user.id) {
      return response.error(400, 'You must provide verified email to delete a user.')
    }

    const businesses = user.get('businesses')
    if (businesses && businesses.length > 0) {
      return response.error('You can not delete the account while having business records.')
    }

    const message = await Message.sendUserDeleteEmail(user, email)
    if (!message) {
      return response.error('Could not send confirmation email, plese try again later')
    }
    response.success({ sent: true, messageId: message.id })
  } catch (error) {
    console.error(`[User@initUserDeletion]:${error}`)
    response.error('Server error. Please try again later.')
  }
})

/**
 * @function finishUserDeletion
 * @description [usage Web] finish user deletion process (confirmation)
 * @kind Cloud Function
 * @param {string} messageId - message id from initUserDeletion response
 * @param {string} code - code from the email
 */
Parse.Cloud.define('finishUserDeletion', async (request, response) => {
  try {
    if (!request.user) {
      return response.error(401, 'Must be logged in to delete a user.')
    }

    const { messageId, code } = request.params
    if (!messageId || !code) {
      return response.error(400, 'You must provide the messageId and code to delete a user.')
    }

    const message = await Message.fetchMessage(null, messageId)
    if (!message) {
      return response.error(404, 'Confirmation request was not found. Please start the process again.')
    }
    if (message.get('toPerson').id !== request.user.id) {
      return response.error(403, 'You are not allowed to delete ths user')
    }

    const token = code.replace(/\D/g, '')
    const tokenValid = await bcrypt.compare(token, message.get('data'))
    if (!tokenValid) {
      // @todo count number of attempts and increment here
      return response.error(400, 'Wrong code')
    }

    // Delete the user
    await Parse.Cloud.run(
      'deleteUsers',
      { users: [request.user.id] },
      { useMasterKey: true }
    )

    response.success({ deleted: true })
  } catch (error) {
    console.error(`[User@finishUserDeletion]:${error}`)
    response.error('Server error. Please try again later.')
  }
})
