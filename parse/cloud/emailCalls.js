/* global Parse */

let constants = require('./constants')
var Mailgun = require('mailgun-js')({ apiKey: process.env.MAILGUN_KEY, domain: process.env.MAILGUN_DOMAIN })

Parse.Cloud.define('reportBug', (request, response) => {
  request.user.getFullName()
    .then(name => {
      let messageText = 'Hi there, this is a  internal message you have a new bug message from a user. Try to reproduce the issue and understand if it is really a problem create an issue in JIRA. You can also contact him using the contacts given below. '
      let mailData = {
        to: constants.bugEmail,
        from: constants.noReplyEmail,
        subject: 'HMI Bug manually added by a user',
        text: `${messageText} \n\n bug note: ${request.params.note} \n\n username: ${name} \n user email: ${request.params.email} \n user phone: ${request.params.phone}`
      }

      console.log('XXXXX reportBug mailData', mailData)
      Mailgun.messages().send(mailData, (error, body) => {
        if (error) {
          console.log('Mailgun message fail: ' + JSON.stringify(error), +' - ' + JSON.stringify(body))
          return response.error(error)
        } else {
          return response.success(true)
        }
      })
      return response.success(true)
    })
})

Parse.Cloud.define('backupContacts', (request, response) => {
  return request.user.getFullName()
    .then(name => {
      let vcardsBuff = Buffer.from(request.params.vCards, 'utf-8')
      var attch = new Mailgun.Attachment({ data: vcardsBuff, filename: `hmi_contacts_${new Date().toLocaleString().replace(/ /g, '_')}.vcf`, contentType: 'text/vcf' })
      let mailData = {
        to: request.params.email,
        from: constants.noReplyEmail,
        subject: 'HMI native contacts backup',
        text: `Hi there ${name}, here it goes your (untouched and unread) contacts. Use this email as your contacts backup.`,
        attachment: attch
      }
      Mailgun.messages().send(mailData, (error, body) => {
        if (error) {
          return response.error(error)
        } else {
          return response.success(true)
        }
      })
      return response.success(true)
    })
    .catch((error) => {
      return response.error(error)
    })
})

Parse.Cloud.define('storeContactsBackup', (request, response) => {
  return request.user.fetch({ useMasterKey: true })
    .then(user => {
      if (!user.get('initialBackup')) {
        user.set('initialBackup', request.params.parseFile)
      } else {
        user.set('lastBackup', request.params.parseFile)
      }
      return user.save(null, { useMasterKey: true })
    })
    .then(() => {
      return response.success(true)
    })
    .catch((error) => {
      return response.error(error)
    })
})

Parse.Cloud.define('getContactsBackup', (request, response) => {
  let query = new Parse.Query(Parse.User)
  query.include('initialBackup')
  query.include('lastBackup')
  return request.user.fetch({ useMasterKey: true })
    .then(user => {
      console.log('getContactsBackup request ', request.params, request.params.version, user.get('initialBackup'))
      if (request.params.version === 'initial') {
        console.log('getting initial')
        return user.get('initialBackup')
      } else {
        console.log('getting last')
        return user.get('lastBackup')
      }
    })
    .then((file) => {
      console.log('getContactsBackup file', file)
      return response.success(file)
    })
    .catch((error) => {
      return response.error(error)
    })
})

/**
 * @function supportMessage
 * @description [usage WEB] send message to HMI support
 * @kind Cloud Function
 * @param {string} email - email of the person requesting support
 * @param {string} message - support message
 */
Parse.Cloud.define('supportMessage', async (request, response) => {
  if (!request.params.email || !request.params.message) {
    return response.error('Provide email and message')
  }
  let messageText = '<h1>Hi there, this is a request support message from a user.</h1>'
  if (request.user) {
    messageText += `Authed user id ${request.user.id}<br/>`
  }
  let mailData = {
    to: constants.supportEmail,
    from: constants.noReplyEmail,
    subject: 'HMI Support Request',
    html: `${messageText} <br/><br/> 
          <strong>Sender email:</strong><br/>${request.params.email}<br/><br/>
          <strong>Message:</strong><br/>${request.params.message}`,
    'h:Reply-To': request.params.email
  }

  try {
    await Mailgun.messages().send(mailData)
    return response.success()
  } catch (error) {
    return response.error('Email sending error')
  }
})
