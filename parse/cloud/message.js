/* global Parse */

var _ = require('underscore')
var User = require('./user.js')
var Property = require('./property.js')
const path = require('path')
const util = require('util')
const ejs = require('ejs')
const plivo = require('plivo')
const plivoClient = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN)
const nanoid = require('nanoid/async')
const generate = require('nanoid/async/generate')
const bcrypt = require('bcrypt')
const PhoneVerification = require('./phoneVerification.js')
var general = require('./general.js')
var Mailgun = require('mailgun-js')({ apiKey: process.env.MAILGUN_KEY, domain: process.env.MAILGUN_DOMAIN })

const renderTemplate = util.promisify(ejs.renderFile)

class Message extends Parse.Object {
  constructor () {
    super('Message')
  }

  // Instance methods

  /**
   * @method
   * @description fetch the related connection to this messsage
   * @instance
   * @memberof Message
   */
  fetchConnection (options) {
    var query = new Parse.Query('Connection')
    query.equalTo('messages', this)
    return query.first(options)
  }

  /**
   * @method
   * @description returns the address that should be used to answer this message
   * @instance
   * @memberof Message
   */
  returnAddress () {
    var toName = this.get('fromName')
    var toPerson = this.get('fromPerson')
    var email = this.get('fromEmail')
    var phone = this.get('fromPhone')
    var fromName = this.get('toName')
    var returnAddress = {
      toName: toName,
      fromName: fromName,
      toPerson: toPerson,
      email: email,
      phone: general.normalizePhone(phone)
    }
    return returnAddress
  }

  resendMessage (user) {
    var message = this
    var sent = message.get('sent')
    var read = message.get('read')
    // TODO check date modified and limit sends
    if (!read && sent < 5) {
      message.increment('sent')
      return message.save(null, { useMasterKey: true }) // this will fire a push
    } else { return Parse.Promise.error('cannot resend message at this time') }
  }

  // Class methods

  /**
   * @method
   * @description make a new unadressed message
   * @instance
   * @memberof Message
   * @todo this should be reviewed.
   */
  static newMessage (user, kind, messageData) {
    console.log('newMessage START ', messageData)
    var message = new Message()
    message.set('read', false)
    message.set('pushed', false)
    message.set('emailed', false)
    message.set('sent', 0)
    message.set('phone', messageData.toPhone)
    message.set('email', messageData.toEmail)

    var acl = new Parse.ACL(user)

    message.setACL(acl)
    message.set('kind', kind)
    message.set('fromPerson', user)
    message.set('toPerson', null)

    message.set('subject', messageData.subject)
    message.set('message', messageData.message)
    message.set('data', messageData.data)
    message.set('fromName', messageData.fromName)
    message.set('toName', messageData.toName)

    if (messageData.fromEmail) { message.set('fromEmail', messageData.fromEmail) }
    if (messageData.fromPhone) { message.set('fromPhone', general.normalizePhone(messageData.fromPhone)) }
    if (messageData.latLong) {
      var latLong = messageData.latLong
      var point = new Parse.GeoPoint(latLong.latitude, latLong.longitude)
      message.set('location', point)
    }
    return message
  }

  /**
   * @method
   * @description send a Message
   * @instance
   * @memberof Message
   * @todo this should be reviewed.
   */
  static sendMessage (fromPerson, messageAddress, messageData, messageKind) {
    var toPerson = messageAddress.toPerson
    var email = messageAddress.email
    var phone = general.normalizePhone(messageAddress.phone)
    var fromName

    if (phone) {
      phone = general.normalizePhone(phone)
    }

    var fMessage // the final message to return

    var reject = function (error) {
      return Parse.Promise.error(error)
    }

    var rejectP = function (error) {
      if (error === 'blocked') {
        return Parse.Promise.as('blocked')
      } else {
        return Parse.Promise.error(error)
      }
    }

    var invitePerson = function () {
      console.log('sendMessage - invite Person', toPerson, fromPerson)
      if (toPerson && toPerson.id) {
        return Message.messagePerson(fromPerson, toPerson, messageKind, messageData)
      } else {
        return User.findUser(null, email, phone).then(
          function (toPerson) {
            if (toPerson && toPerson.id) {
              console.log('checking fromPerson: ' + fromPerson)
              console.log('checking toPerson: ' + toPerson)
              return Message.messagePerson(fromPerson, toPerson, messageKind, messageData)
            } else {
              console.log('couldn\'t find anyone')
              return Parse.Promise.as(null)
            }
          }, reject)
      }
    }

    var inviteEmail = function (message) {
      console.log('sendMessage - invite Email')
      if (message) {
        fMessage = message
      }
      if (email) {
        return Message.messageByEmail(fromPerson, fromName, email, messageKind, messageData, fMessage)
      } else {
        console.log('Could not find email address for message ' + JSON.stringify(message))
        var innerPromise = new Parse.Promise()
        innerPromise.resolve(fMessage)
        return innerPromise
      }
    }

    var inviteText = function (message) {
      console.log('sendMessage - invite Text')
      if (message && !fMessage) {
        fMessage = message
      }

      if (phone) {
        return Message.messageBySMS(fromPerson, fromName, phone, messageKind, messageData, fMessage)
      } else {
        console.log('Could not find phone for message ' + JSON.stringify(message))
        var innerPromise = new Parse.Promise()
        innerPromise.resolve(fMessage)
        return innerPromise
      }
    }

    let profile = fromPerson.get('profile')
    return profile.fetch({ useMasterKey: true })
      .then((fetchedProfile) => {
        fromName = fetchedProfile.get('name')
        return invitePerson()
      }
      ).then(inviteEmail, rejectP)
      .then(inviteText, reject)
      .then((message) => {
        console.log('sendMessage - final ', message, fMessage)
        if (message && !fMessage) {
          fMessage = message
        }

        var promise = new Parse.Promise()
        promise.resolve(fMessage)
        return promise
      })
      .catch((error) => {
        console.log('sendMessage error ', error)
        return Parse.Promise.error(error)
      })
  }

  /**
   * @method
   * @description create a message record for a known person
   * @instance
   * @memberof Message
   * @todo this should be reviewed.
   */
  static messagePerson (fromPerson, toPerson, kind, messageData) {
    let queryProfile = new Parse.Query('Profile')
    let messageRef
    let fromName
    let toName
    let message = Message.newMessage(fromPerson, kind, messageData)
    console.log('messagePerson start ', message, fromPerson, fromPerson.get('profile').id, toPerson)
    var messageACL = message.getACL()
    messageACL.setReadAccess(toPerson, true)
    messageACL.setWriteAccess(toPerson, true)
    messageACL.setPublicReadAccess(false)
    messageACL.setPublicWriteAccess(false)
    message.setACL(messageACL)
    message.set('toPerson', toPerson)
    message.increment('sent')
    messageRef = message
    // set the fromName

    return queryProfile.get(fromPerson.get('profile').id, { useMasterKey: true })
      .then((profile) => {
        console.log('messagePerson query Profile ', profile)
        fromName = profile.get('name')
        return queryProfile.get(toPerson.get('profile').id, { useMasterKey: true })
      })
      .then((profile) => {
        toName = profile.get('name')
        if (!messageRef.get('fromName')) {
          console.log('setting name of from person - no name was found: ', fromName)
          messageRef.set('fromName', fromName)
        }
        if (!messageRef.get('toName')) {
          console.log('setting name of to person - no name was found: ', toName)
          messageRef.set('toName', toName)
        }
        console.log('saving... messageRef')
        return messageRef.save(null, { useMasterKey: true })
      })
      .catch((err) => {
        console.log('messagePerson error ', err)
      })
  }

  /**
   * @method
   * @description send a Message through email
   * @instance
   * @memberof Message
   * @todo this should be reviewed. email templates should be created
   */
  static async messageByEmail (fromPerson, fromName, email, kind, messageData, givenMessage) {
    let message
    if (givenMessage) {
      message = givenMessage
    } else {
      if (!messageData.fromName) {
        const profile = await fromPerson.get('profile').fetch({ useMasterKey: true })
        messageData.fromName = profile.get('name')
      }
      message = Message.newMessage(fromPerson, kind, messageData)
    }
    console.log('messageByEmail', message)
    var promise = new Parse.Promise()
    var fromEmail = 'HeresMyInfo <noreply@heresmyinfo.com>'
    if (fromName) {
      fromEmail = fromName + ' via HeresMyInfo <noreply@heresmyinfo.com>'
    }
    var subject = kind === 'accept' ? buildAcceptSubject(fromName) : buildInviteSubject(fromName)
    var messageText = kind === 'accept' ? buildAcceptMessage(fromName) : buildInviteMessage(fromName)
    var mailData = {}

    console.log(' message.js object', message)
    message.set('email', email)
    const inviteURL = process.env.WEBAPP_URL + '/invite'
    console.log('process.env.inviteCheck message.js', inviteURL)
    return message.save(null, { useMasterKey: true })
      .then(
        function (savedMessage) {
          const emailLink = `${inviteURL}/${savedMessage.id}`
          let buttonStyle = `
                    border: none;
                    width: 300px;
                    height: 60px;
                    margin: auto; 
                    margin-top: 50px;
                    line-height: 60px;
                    background-color: #00A956;
                    color: #FFFFFF;
                    font-size: 20pt;
                    text-align: center;
                    display: block;
                    text-decoration: none;`

          let html = `
                <p style="text-align: center;">
                    ${messageText}
                    <a href="${emailLink}" style="${buttonStyle}">Open Invitation</a>
                </p>`

          if (kind === 'accept') {
            html = `
                    <p style="text-align: center;">
                        ${messageText}
                    </p>`
          }

          mailData = {
            to: email,
            from: fromEmail,
            subject: subject,
            html: html
          }

          Mailgun.messages().send(mailData, function (error, body) {
            if (error) {
              console.log('Mailgun message fail: ' + JSON.stringify(error), +' - ' + JSON.stringify(body))
              promise.reject(error)
            } else {
              savedMessage.increment('sent')
              savedMessage.set('emailed', true)

              savedMessage.save(null, { useMasterKey: true }).then(
                function (message) {
                  console.log('messageByEmail')
                  promise.resolve(savedMessage)
                },
                function (error) {
                  console.log('messageByEmail save fail: ' + JSON.stringify(error))
                  promise.reject(error)
                }
              )
            }
          })
        },
        function (error) {
          promise.reject(error)
        }
      ).then(function (obj) {
        return promise
      })
  }

  /**
   * @method
   * @description send a Message through SMS
   * @instance
   * @memberof Message
   * @todo this should be reviewed.
   */
  static messageBySMS (user, fromName, phone, kind, messageData, message) {
    let thisMessage
    var promise = new Parse.Promise()
    console.log('messageBySMS Starting')

    let createdMessage
    if (message) {
      createdMessage = message
    } else {
      createdMessage = Message.newMessage(user, kind, messageData)
    }
    console.log('messageBySMS message and phone', createdMessage, phone)
    createdMessage.set('phone', phone)
    createdMessage.setACL(new Parse.ACL(user))
    return createdMessage.save(null, { useMasterKey: true })
      .then((savedMessage) => {
        thisMessage = savedMessage
        const inviteURL = `${process.env.WEBAPP_URL}/invite/${thisMessage.id}`

        var messageText = buildInviteMessage(fromName) + ' ' + inviteURL
        console.log('messageBySMS message and phone ready to send', user.get('E164'), phone, messageText)
        return plivoClient.messages.create(user.get('E164'), phone, messageText)
      })
      .then((data) => {
        console.log('messageBySMS created ', data)
        thisMessage.increment('sent')
        promise.resolve(thisMessage)
        return promise
      })
      .catch((err) => {
        console.log('ERROR messageBySMS message and phone', err)
        promise.reject(err)
      })
  }

  static fetchMessage (user, messageID) {
    var query = new Parse.Query(Message)
    query.include('fromPerson')
    query.include('toPerson')
    return query.get(messageID, { useMasterKey: true })
  }

  /**
   * @method sendVerificationBusinessEmail
   * @description Send verification email to verify business property
   * @instance
   * @param {user} Parse.User owner of the business
   * @param {business} Business business owning the property
   * @param {property} BusinessProperty property to validate
   * @memberof Message
   */
  static async sendVerificationBusinessEmail (user, business, property) {
    try {
      const messageData = {}
      messageData.subject = 'HeresMyInfo E-mail validation'
      messageData.fromEmail = 'HeresMyInfo <noreply@heresmyinfo.com>'
      messageData.toName = business.get('name').get('value')
      messageData.toEmail = property.get('parameters')[1].value
      messageData.data = messageData.toEmail
      const kind = 'verifyBusinessEmail'
      const message = Message.newMessage(user, kind, messageData)
      await message.save(null, { useMasterKey: true })
      const verifyURL = process.env.WEBAPP_URL + `/business/${business.id}/verify/${property.id}`
      const emailLink = `${verifyURL}?id=${message.id}`
      const html = await renderTemplate(path.join(__dirname, '/views/email/businessEmailVerification.ejs'), { emailLink })

      const mailData = {
        to: messageData.toEmail,
        from: messageData.fromEmail,
        subject: messageData.subject,
        html: html
      }
      await Mailgun.messages().send(mailData)
      message.increment('sent')
      message.set('emailed', true)
      await message.save(null, { useMasterKey: true })
    } catch (err) {
      console.error(`[Message@sendVerificationBusinessEmail]: ${err}`)
    }
  }

  /**
   * @method sendPasswordRecoveryEmail
   * @description Send password recovery email
   * @instance
   * @param {user} Parse.User user to recover password
   * @param {email} string email specified by user
   * @memberof Message
   */
  static async sendPasswordRecoveryEmail (user, email) {
    try {
      const kind = 'passwordRecovery'

      const token = await nanoid()
      const hashedToken = await bcrypt.hash(token, 10)

      const messageData = {}
      messageData.subject = 'HeresMyInfo password recovery'
      messageData.fromEmail = 'HeresMyInfo <noreply@heresmyinfo.com>'
      messageData.toName = (user.get('profile').get('properties').filter(p => p.get('name') === 'fn')[0] || {}).get('value') || user.get('profile').get('name')
      messageData.toEmail = email
      messageData.data = hashedToken

      const message = Message.newMessage(user, kind, messageData)
      message.set('toPerson', user)
      await message.save(null, { useMasterKey: true })

      const verifyURL = process.env.WEBAPP_URL + `/recovery`
      const emailLink = `${verifyURL}?id=${message.id}&token=${token}`
      const renderTemplate = util.promisify(ejs.renderFile)
      const html = await renderTemplate(path.join(__dirname, '/views/email/passwordRecovery.ejs'), { emailLink })

      const mailData = {
        to: messageData.toEmail,
        from: messageData.fromEmail,
        subject: messageData.subject,
        html: html
      }
      await Mailgun.messages().send(mailData)

      message.increment('sent')
      message.set('emailed', true)
      await message.save(null, { useMasterKey: true })

      return true
    } catch (err) {
      console.error(`[Message@sendPasswordRecoveryEmail]: ${err}`)
      return false
    }
  }

  /**
   * @method sendUserDeleteEmail
   * @description Send user delete confirmation email
   * @instance
   * @param {user} Parse.User user to delete
   * @param {email} string email specified by user
   * @memberof Message
   */
  static async sendUserDeleteEmail (user, email) {
    try {
      const kind = 'userDeletion'

      const token = await generate('0123456789', 8)
      const hashedToken = await bcrypt.hash(token, 10)

      const messageData = {}
      messageData.subject = 'HeresMyInfo user deletion confirmation'
      messageData.fromEmail = 'HeresMyInfo <noreply@heresmyinfo.com>'
      messageData.toName = await user.getFullName()
      messageData.toEmail = email
      messageData.data = hashedToken

      const message = Message.newMessage(user, kind, messageData)
      message.set('toPerson', user)
      await message.save(null, { useMasterKey: true })

      const renderTemplate = util.promisify(ejs.renderFile)
      const html = await renderTemplate(
        path.join(__dirname, '/views/email/userDeletion.ejs'),
        { token: `${token.substring(0, 4)} ${token.substring(4)}` }
      )

      const mailData = {
        to: messageData.toEmail,
        from: messageData.fromEmail,
        subject: messageData.subject,
        html: html
      }
      await Mailgun.messages().send(mailData)

      message.increment('sent')
      message.set('emailed', true)
      await message.save(null, { useMasterKey: true })

      return message
    } catch (err) {
      console.error(`[Message@sendUserDeleteEmail]: ${err}`)
      return false
    }
  }
}

Parse.Object.registerSubclass('Message', Message)

Parse.Cloud.define('claimMessages', function (request, response) {
  let noMessagesFoundError = 'noMessagesFound'
  let user = request.user
  let toName
  let messages = []

  if (!user) {
    console.log('claimMessages - user not logged in')
    response.error('must be logged in to claim messages')
    return
  }
  console.log('START Claiming messages')
  new Parse.Query('Profile').first(user.sessionOptions()).then(
    function (profile) {
      toName = profile.get('name')

      var getProperties = new Parse.Query('Property')
      getProperties.containedIn('name', ['phoneNumbers', 'emailAddresses'])
      return getProperties.find(user.sessionOptions())
    },
    function (error) {
      return Parse.Promise.error(error)
    }
  ).then(
    function (properties) {
      console.log('XXXXXXX claimMessages ', properties)
      var allValues = []
      for (var c = 0; c < properties.length; c++) {
        if (properties[c].get('value')) {
          allValues.push(properties[c].get('value'))
        }
      }
      // REMOVE LATER
      allValues.push(user.get('username'))
      allValues.push(user.get('email'))
      console.log('XXXXXXX claimMessages 1', allValues)
      // now we have all the properties we want.
      var messageInnerQueryEmail = new Parse.Query('Message')
      messageInnerQueryEmail.equalTo('kind', 'invite')
      messageInnerQueryEmail.doesNotExist('toPerson')
      messageInnerQueryEmail.containedIn('email', allValues)
      console.log('XXXXXXX claimMessages 2', allValues)
      var messageInnerQueryPhone = new Parse.Query('Message')
      messageInnerQueryPhone.equalTo('kind', 'invite')
      messageInnerQueryPhone.doesNotExist('toPerson')
      messageInnerQueryPhone.containedIn('phone', allValues)

      var messagesQuery = Parse.Query.or(messageInnerQueryEmail, messageInnerQueryPhone)
      return messagesQuery.find({ useMasterKey: true })
    }
  ).then(
    function (foundMessages) {
      console.log('XXXXXXX claimMessages 3', foundMessages)
      let promises = []
      messages = foundMessages
      _.each(messages, function (message) {
        var messageACL = message.getACL()
        messageACL.setReadAccess(user, true)
        messageACL.setWriteAccess(user, true)
        messageACL.setPublicReadAccess(false)
        messageACL.setPublicWriteAccess(false)
        message.setACL(messageACL)

        message.set('toPerson', user)
        message.set('toName', toName)
        message.set('pushed', true)
        message.set('emailed', true)

        let promise = message.save(null, { useMasterKey: true })
        promises.push(promise)
        return Parse.Promise.when(promises)
      })
    },
    function (error) {
      return Parse.Promise.error(error)
    })
    .then(() => {
      user.set('newInvitationsFlag', true)
      return user.save(null, { useMasterKey: true })
    })
    .then(function (user) {
      if (user) {
        return response.success(messages)
      }
    },
    function (error) {
      if (error === noMessagesFoundError) {
        return response.success([])
      }

      return response.error(error)
    }
    )
})

// normally we send messages to another person in Connections
// but we also allow messages via email and SMS
Parse.Cloud.define('sendMessage', function (request, response) {
  // mp.track('sendMessage');

  if (request.user) {
    var user = request.user
    var kind = request.params.kind
    var messageAddress = request.params.messageAddress
    var messageData = request.params.messageData

    if (!messageAddress || !kind || !messageData) {
      response.error('Must have a messageAddress, kind, and messageData to send Message.')
    } else {
      if (!messageData.subject) {
        messageData.subject = '<None>'
      }
      if (!messageData.fromPerson) {
        messageData.fromPerson = user
      }
      if (!messageData.fromPhone) {
        messageData.fromPhone = user.get('E164')
      }
      if (!messageData.fromEmail) {
        messageData.fromEmail = user.get('email')
      }

      return Message.sendMessage(user, messageAddress, messageData, kind).then(
        function (sentMessage) {
          response.success(sentMessage)
        },
        function (error) {
          response.error(error.message)
        }
      )
    }
  } else {
    response.error('Must be logged in to invite a user.')
  }
})

const sendPush = function (toPerson, forMessage) {
  var message = forMessage.get('message')
  var kind = forMessage.get('kind')
  var pushData
  console.log('sendPush to ' + JSON.stringify(toPerson) + ' for Message')
  if (kind === 'invite') {
    pushData = {
      'alert': {
        'body': message,
        'action-loc-key': 'VIEW'
      },
      'badge': 'Increment',
      'sound': 'default',
      'category': 'InviteCategory',
      'messageId': forMessage.id,
      'messageKind': forMessage.get('kind')
    }
    User.pushToUser(toPerson, pushData)
  } else if (kind === 'accept' || kind === 'decline') {
    pushData = {
      'alert': message,
      'badge': 'Increment',
      'sound': 'default',
      'content-available': 1,
      'messageId': forMessage.id,
      'messageKind': forMessage.get('kind')
    }
    User.pushToUser(toPerson, pushData)
  } else {
    pushData = {
      'content-available': 1,
      'messageId': forMessage.id,
      'messageKind': forMessage.get('kind')
    }
    User.pushToUser(toPerson, pushData)
  }
}

Parse.Cloud.define('findUnreadMessages', function (request, response) {
  var query = new Parse.Query('Message')
  var user = request.user
  var kind = request.params.kind

  query.equalTo('toPerson', user)
  query.equalTo('kind', kind)
  query.equalTo('read', false)

  return query.find()
    .then(
      function (messages) {
        var messageIds = []

        _.each(messages, function (message) {
          return messageIds.push(message.id)
        })

        return response.success(messageIds)
      },
      function (error) {
        return response.error(error)
      }
    )
})

Parse.Cloud.define('processUnreadMessages', function (request, response) {
  var messageIds = request.params.messageIds
  var kind = request.params.kind
  var promises = []
  var user = request.user

  _.each(messageIds, function (messageId) {
    var args = {
      message: messageId
    }
    if (kind === 'update') { return promises.push(Parse.Cloud.run('connectionUpdated', args, user.sessionOptions())) }
    if (kind === 'accept') { return promises.push(Parse.Cloud.run('inviteAccepted', args, user.sessionOptions())) }
    if (kind === 'decline') { return promises.push(Parse.Cloud.run('inviteDeclined', args, user.sessionOptions())) }
  })

  return Parse.Promise.when(promises)
    .then(
      function () {
        response.success('processed messages: ' + JSON.stringify(arguments))
      },
      function (error) {
        response.error(error)
      }
    )
})

//
// notify admins that a new user has signed up
//
Parse.Cloud.define('notifySignup', function (request, response) {
  Mailgun.sendEmail({
    to: request.params.to,
    from: request.params.from,
    subject: request.params.subject,
    html: request.params.html
  }, {
    success: function () {
      response.success('Mailgun sent successfully!')
    },
    error: function () {
      response.error('something went wrong with Mailgun')
    }
  })
})

Parse.Cloud.define('sendValidationFieldMessage', function (request, response) {
  let args
  console.log('sendValidationFieldMessage START ', request.params, request.user)
  if (request.params.type === 'phoneNumbers') {
    args = {
      username: request.user ? request.user.get('username') : general.normalizePhone(request.params.data.countryCode ? request.params.data.phone.substr(1 + request.params.data.countryCode.length) : request.params.data.phone),
      givenName: request.user ? request.user.getGivenName() : null,
      familyName: request.user ? request.user.getFamilyName() : null,
      phone: general.normalizePhone(request.params.data.countryCode ? request.params.data.phone.substr(1 + request.params.data.countryCode.length) : request.params.data.phone),
      countryCode: request.params.data.countryCode
    }
    console.log('sendValidationFieldMessage Phone args ', args)
    Parse.Cloud.run('sendVerifyBySMS', args, request.user ? request.user.sessionOptions() : null)
      .then(resp => {
        console.log('response.success ', resp)
        response.success(resp)
      })
      .catch((error) => {
        console.log('sendValidationFieldMessage Phone Error: ', error)
        response.error(error)
      })
  } else {
    args = {
      username: request.user ? request.user.get('username') : request.params.data,
      givenName: request.user ? request.user.getGivenName() : null,
      familyName: request.user ? request.user.getFamilyName() : null,
      email: request.params.data
    }
    console.log('sendValidationFieldMessage Email args ', args)
    Parse.Cloud.run('sendVerifyByEMAIL', args, request.user ? request.user.sessionOptions() : null)
      .then(resp => {
        console.log('response.success ', resp)
        response.success(resp)
      })
      .catch((error) => {
        console.log('sendValidationFieldMessage Email Error: ', error)
        response.error(error)
      })
  }
})

// NewLogin
Parse.Cloud.define('verifyInitialSMSCode', function (request, response) {
  console.log('XXXXXXXXXXX verifyInitialSMSCode', request.params)
  PhoneVerification.verifyPhone({ countryCode: request.params.countryCode, phone: request.params.phone, token: request.params.code })
    .then((data) => {
      console.log('XXXXXXXXXXX verifyInitialSMSCode DONE', data, request.params.username)
      return Property.getPropertyByParameterValue(request.params.phone, 'phoneNumbers', false, request.user)
    })
    .then((property) => {
      console.log('verifyInitialSMSCode phone property', property)
      return property.save('verified', true, { useMasterKey: true })
    })
    .then((property) => {
      const uQuery = new Parse.Query(Parse.User)
      uQuery.include('profile.properties')
      return uQuery.get(request.user.id, request.user.sessionOptions())
    })
    .then(user => response.success(user))
    .catch((error) => {
      if (error) {
        console.log('Verify Token Error: ', error)
        response.error(error)
      }
    })
})

/**
 * @function verifySubsequentSMSCode
 * @description [usage MOBILE] allows to validate by SMS other phone numbers
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.countryCode - CC
 * @param {string} params.phone - phone
 * @param {string} params.code - authy code
 * @todo
 */
Parse.Cloud.define('verifySubsequentSMSCode', function (request, response) {
  console.log('XXXXXXXXXXX verifySubsequentSMSCode', request.params)
  let thisData
  PhoneVerification.verifyPhone({ countryCode: request.params.countryCode, phone: request.params.phone, token: request.params.code })
    .then((data) => {
      thisData = data
      console.log('XXXXXXXXXXX verifySubsequentSMSCode DONE', data)
      return Property.getPropertyByParameterValue(request.params.phone, 'phoneNumbers', false, request.user)
    })
    .then((property) => {
      console.log('verifySubsequentSMSCode phone property', property)
      property.save('verified', true, { useMasterKey: true })
      response.success(thisData)
    })
    .catch((error) => {
      if (error) {
        console.log('Verify Token Error: ', error)
        response.error(error.message)
      }
    })
})

/**
 * @function sendVerifyBySMS
 * @description [usage MOBILE] allows validate phone by sending a phone validation SMS
 * @description [usage WEB] allows validate phone by sending a phone validation SMS
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.username
 * @param {string} params.givenName
 * @param {string} params.familyName
 * @param {string} params.countryCode
 * @param {string} params.phone
 */
Parse.Cloud.define('sendVerifyBySMS', async function (request, response) {
  console.log('sendVerifyBySMS', request.params)

  try {
    const userQuery = new Parse.Query(Parse.User)
    const { username } = request.params
    const phone = general.normalizePhone(request.params.phone)
    userQuery.equalTo('username', username)
    userQuery.include('profile.properties')
    const user = await userQuery.first({ useMasterKey: true })
    if (!user) {
      return response.error(`User ${username} not found`)
    }

    const phoneProperty = user.get('profile').get('properties').find(_ =>
      _.get('name') === 'phoneNumbers' &&
      _.hasParameterValueByIndex(1, phone)
    )

    if (!phoneProperty) {
      return response.error(`Phone ${phone} not found`)
    }

    if (phoneProperty.get('verified') === true) {
      return response.error(`Phone ${phone} is already verified`)
    }

    if (phoneProperty.hasParameterValueByIndex(3, Property.TYPE_LANDLINE)) {
      // Should return error here but clients are not ready to handle it correctly
      return response.success(true)
    }

    console.log('sendVerifyBySMS user', user)
    const messageData = {}
    messageData.subject = 'SMS Validation'
    messageData.toName = request.params.givenName + ' ' + request.params.familyName
    messageData.toPhone = phone
    const kind = 'verifyPhone'
    const message = Message.newMessage(user, kind, messageData)
    await message.save(null, { useMasterKey: true })
    const val = await PhoneVerification.startPhoneVerification({
      countryCode: request.params.countryCode,
      locale: 'en',
      phone: phone,
      via: 'sms'
    })

    console.log('SUCCESS sendVerifyBySMS', val)
    return response.success(val)
  } catch (error) {
    console.log('ERROR sendVerifyBySMS', error)
    return response.error(error)
  }
})

/**
 * @function sendVerifyByEMAIL
 * @description [usage MOBILE] allows validate an email by sending a email validation
 * @description [usage WEB] allows validate an email by sending a email validation
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.username
 * @param {string} params.givenName
 * @param {string} params.familyName
 * @param {string} params.email
 * @todo create outside email template!
 */
Parse.Cloud.define('sendVerifyByEMAIL', async function (request, response) {
  console.log('sendVerifyByEMAIL', request.params)
  const messageData = {}

  try {
    const userQuery = new Parse.Query(Parse.User)
    userQuery.equalTo('username', request.params.username)
    const user = await userQuery.first({ useMasterKey: true })

    const token = await nanoid()
    const hashedToken = await bcrypt.hash(token, 10)

    messageData.subject = 'HeresMyInfo E-mail validation'
    messageData.toName = request.params.givenName + ' ' + request.params.familyName
    messageData.toEmail = request.params.email
    messageData.fromEmail = 'HeresMyInfo <noreply@heresmyinfo.com>'
    messageData.data = hashedToken
    const kind = 'verifyEmail'
    const message = Message.newMessage(user, kind, messageData)
    await message.save(null, { useMasterKey: true })

    const verifyURL = process.env.WEBAPP_URL + '/verifyEmail'
    const emailLink = `${verifyURL}?token=${token}&id=${message.id}`
    const html = await renderTemplate(path.join(__dirname, '/views/email/businessEmailVerification.ejs'), { emailLink })

    const mailData = {
      to: messageData.toEmail,
      from: messageData.fromEmail,
      subject: messageData.subject,
      html: html
    }
    await Mailgun.messages().send(mailData)

    message.increment('sent')
    message.set('emailed', true)
    await message.save(null, { useMasterKey: true })

    response.success(true)
  } catch (error) {
    console.log('ERROR sendVerifyByEMAIL', error)
    response.error(error)
  }
})

function buildAcceptSubject (fromName) {
  if (fromName) {
    return fromName + ' accepted your request.'
  }

  return 'Someone accepted your connection.'
}

function buildAcceptMessage (fromName) {
  if (fromName) {
    return fromName + ' accepted your connection request via HeresMyInfo!'
  }

  return "You've been accepted as a connection via HeresMyInfo. It's free and it's private."
}

function buildInviteSubject (fromName) {
  if (fromName) {
    return fromName + ' has invited you to connect.'
  }

  return "You've been invited to receive contact information."
}

function buildInviteMessage (fromName) {
  if (fromName) {
    return fromName + " has invited you to connect via HeresMyInfo. It's free and it's private."
  }

  return "You've been invited to receive contact information via HeresMyInfo. It's free and it's private."
}

Parse.Cloud.beforeSave('Message', function (request, response) {
  var pushed = request.object.get('pushed')
  var read = request.object.get('read')
  if (!pushed && !read) {
    var toPerson = request.object.get('toPerson')
    if (toPerson) {
      sendPush(toPerson, request.object)
      request.object.set('pushed', true)
    }
  }

  response.success()
})

module.exports = Message
