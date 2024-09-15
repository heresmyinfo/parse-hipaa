/* global Parse */

var Connection = require('./connection.js')
var Message = require('./message.js')
var Circle = require('./circle.js')
var Property = require('./property.js')
var User = require('./user.js')
var general = require('./general.js')

/**
 * @function canInvite
 * @description [usage MOBILE] can a user "fromPerson" invite a person using user obj, email or phone
 * @param {object} params
 * @param {string} params.fromPerson
 * @param {string} params.toPerson
 * @param {string} params.email
 * @param {string} params.phone
 * @param {string} params.user
 * @todo
 */
const canInvite = function (fromPerson, toPerson, email, phone, user) {
  console.log('cloud invite.js canInvite', fromPerson, toPerson, email, phone, user)
  let myPromise = new Parse.Promise()
  let finalConnection

  if (email) {
    myPromise = Property.getPropertyByParameterValue(email, 'emailAddresses', false)
      .then((property) => {
        console.log('cloud invite.js canInvite property', property)
        if (property) {
          return User.getUserbyProperty(property)
        }
        return null
      })
  }

  if (phone) {
    myPromise = Property.getPropertyByParameterValue(phone, 'phoneNumbers', false)
      .then((property) => {
        console.log('cloud invite.js canInvite property', property)
        if (property) {
          return User.getUserbyProperty(property)
        }
        return null
      })
  }

  if (toPerson) {
    myPromise = User.fetchUser(toPerson)
  }

  return myPromise
    .then((fetchedToPerson) => {
      if (user && fetchedToPerson && fetchedToPerson.id === user.id) {
        return 'Invite to youreself'
      }
      console.log('cloud invite.js findConnection', fetchedToPerson, email, phone)
      return Connection.findConnectionByPersonsOrParams(fromPerson, fetchedToPerson, email, phone, 'connected')
        .then((connection) => {
          finalConnection = connection
          if (finalConnection) {
            console.log('cloud invite.js connection get status', finalConnection)
            return finalConnection.get('status') !== 'declined' ? finalConnection.get('status') : 'pending'
          } else {
            return null
          }
        })
    })
    .then((connReason) => {
      console.log('cloud invite.js final connection', finalConnection)
      if (connReason) {
        return ({ response: false, reason: connReason, payload: finalConnection })
      } else {
        return ({ response: true })
      }
    })
    .catch((error) => {
      console.log('canInvite failed: ' + error)
    })
}

/**
 * @function canInvitePerson
 * @description [usage MOBILE] person to be invited based on email, phone, or user obj
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.toPerson - person to be invited by user obj
 * @param {string} params.email
 * @param {string} params.phone
 * @todo
 */
Parse.Cloud.define('canInvitePerson', function (request, response) {
  console.log('cloud canInvitePerson request object', request)
  if (request.user) {
    let toPerson = request.params.toPerson
    console.log('cloud canInvitePerson toPerson', toPerson)
    let email = request.params.email
    console.log('cloud canInvitePerson email', email)
    let phone = general.normalizePhone(request.params.phone)
    console.log('cloud canInvitePerson phone', phone)
    let fromPerson = request.user
    console.log('cloud canInvitePerson fromPerson', fromPerson)
    let user = request.user
    console.log('cloud canInvitePerson user', user)
    // find a connection
    canInvite(fromPerson, toPerson, email, phone, user)
      .then((resp) => {
        console.log('cloud canInvitePerson final ', resp)
        response.success(resp)
      })
  } else {
    response.error('Must be logged in to call canInvitePerson.')
  }
})

/**
 * @function generateInviteFromQRCode
 * @description [usage MOBILE] Create an invite based on a QRCode received and on the user in user session sending it
 *  based on the circle associated with the QRCode.
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.qrcode - scanned user QRCode from which the invite is comming from
 * @todo
 */
Parse.Cloud.define('generateInviteFromQRCode', async function (request, response) {
  console.log('generateInviteFromQRCode fromUser ', request)
  if (!request.user) {
    return response.error('Must be logged in to generate invite to the user')
  }

  try {
    const QRCodeQuery = new Parse.Query('QRCode')
    QRCodeQuery.equalTo('QRCode', request.params.qrcode)
    QRCodeQuery.include('circle')
    QRCodeQuery.include('user')
    const QRCode = await QRCodeQuery.first({ useMasterKey: true })

    const fromUser = QRCode.get('user')
    const toUser = request.user

    const canInviteObj = await canInvite(fromUser, toUser, null, null, fromUser)
    console.log('generateInviteFromQRCode fromUser canInvite', fromUser.id, canInviteObj)

    if (canInviteObj.response) {
      const circleId = QRCode.get('circle').id
      let args = {
        circles: [circleId],
        subject: 'A QR Code was scanned by you',
        message: null,
        messageAddress: { },
        fromPersonId: fromUser.id,
        toPersonId: toUser.id
      }
      console.log('generateInviteFromQRCode circle QRCircle ', circleId, args)
      const connection = await Parse.Cloud.run('invitePerson', args, request.user.sessionOptions())
      const message = await Connection.fetchInvite(connection)
      console.log('generateInviteFromQRCode sending existent message: ', message, message.id)
      response.success({ status: 'new', messageId: message.id })
    } else {
      const message = await Connection.fetchInvite(canInviteObj.payload)
      console.log('generateInviteFromQRCode sending existent message from conn: ', message)
      response.success({ status: 'existent', messageId: message.id })
    }
  } catch (error) {
    console.log('generateInviteFromQRCode error: ', error)
    return response.error(error)
  }
})

/**
 * @function invitePerson
 * @description [usage MOBILE] person to be invited based on email, phone, or user obj
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.circles - circle(s - in future will be an array) to be shared in invitation
 * @param {string} params.messageAddress - message to be used
 * @param {string} params.subject -
 * @param {string} params.message
 * @todo since invitePerson is always used with a previsou canInvite, we should have them working together here;
 */
Parse.Cloud.define('invitePerson', function (request, response) {
  console.log('InvitePerson', request.user, request.params.circles)
  let myPromise = new Parse.Promise()
  if (request.user && request.params.circles) {
    let circleIds = request.params.circles
    let messageAddress = request.params.messageAddress
    let circles, connection, messageData
    let fromPerson = request.user
    let toPerson
    let phone = general.normalizePhone(messageAddress.phone)
    let userQuery = new Parse.Query(Parse.User)
    messageData = {
      subject: request.params.subject,
      message: request.params.message
    }
    if (messageAddress.email) {
      myPromise = Property.getPropertyByParameterValue(messageAddress.email, 'emailAddresses', true)
        .then((property) => {
          console.log('cloud invite.js canInvite property', property)
          if (property) {
            return User.getUserbyProperty(property)
          }
          return null
        })
    }
    if (phone) {
      myPromise = Property.getPropertyByParameterValue(phone, 'phoneNumbers', true)
        .then((property) => {
          console.log('cloud invite.js canInvite property', property)
          if (property) {
            return User.getUserbyProperty(property)
          }
          return null
        })
    }
    if (request.params.toPersonId) {
      myPromise = userQuery.get(request.params.toPersonId, { useMasterKey: true })
    }
    return myPromise
      .then((newToPerson) => {
        toPerson = newToPerson
        messageAddress.toPerson = toPerson
        if (request.params.fromPersonId) {
          return userQuery.get(request.params.fromPersonId, { useMasterKey: true })
        }
      })
      .then((usr) => {
        if (usr) {
          fromPerson = usr
        }
        if (circleIds) {
          return Circle.circlesFromIds(fromPerson, circleIds)
        }
      })
      .then((fetchedCircles) => {
        circles = fetchedCircles
        console.log('making a new connection....', fromPerson, messageAddress, circles)
        connection = Connection.newConnection(fromPerson, messageAddress, circles)
        console.log('circleFromIds', fetchedCircles)
        return Circle.messageDataFromCircles(fromPerson, circles, messageData)
      })
      .then((finalMessageData) => {
        messageData = finalMessageData
        return connection.sendConnectionMessage(fromPerson, messageAddress, messageData, 'invite')
      })
      .then((msgId) => {
        console.log('msg created ', msgId)
        return connection.save(null, { useMasterKey: true })
      })
      .then((conn) => {
        console.log('msg created 2', conn, conn.get('toPerson'))
        if (conn.get('toPerson')) {
          let query = new Parse.Query(Parse.User)
          query.equalTo('objectId', conn.get('toPerson').id)
          query.first({ useMasterKey: true })
            .then((thisUser) => {
              thisUser.set('newInvitationsFlag', true)
              thisUser.save(null, { useMasterKey: true })
            })
        }
        response.success(conn)
        return conn
      }
      ).catch((error) => {
        console.log('invitePerson failed: ', error)
        response.error(error)
      })
  } else {
    response.error('Must be logged in and select circles to invite a user.')
  }
})

/**
 * @function generateInviteFromQRCode
 * @description not used yet. Remind an invitation
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.message - invite to be reminded
 * @todo
 */
Parse.Cloud.define('remindInvite', function (request, response) {
  if (request.user) {
    let messageId = request.params.message
    let message, connection
    let user = request.user

    Message.fetchMessage(user, messageId).then(
      function (foundMessage) {
        message = foundMessage
        return message.fetchConnection(user.sessionOptions())
      }
    ).then(
      function (foundConnection) {
        if (foundConnection) {
          connection = foundConnection
          return message.resendMessage(user)
        } else {
          return Parse.Promise.error('no matching connection')
        }
      }
    ).then(
      function () {
        response.success(connection)
      },
      function (error) {
        response.error(error)
      }
    )
  } else {
    response.error('Must be logged in to remind a person.')
  }
})

/**
 * @function revokeInvite
 * @description [usage MOBILE] decline an Invite and remove associates messages
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.invitation - invitation to be declined
 * @todo
 */
Parse.Cloud.define('revokeInvite', function (request, response) {
  if (request.user) {
    let connectionId = request.params.invitation
    let connection
    let user = request.user
    console.log('XXXX revokeInvite 0', connectionId)
    let query = new Parse.Query(Connection)
    query.equalTo('objectId', connectionId)
    query.equalTo('status', 'pending')
    return query.first(user.sessionOptions())
      .then(
        (foundConnection) => {
          if (foundConnection) {
            connection = foundConnection
            return connection.relation('messages').query().find(user.sessionOptions())
          }
        }
      )
      .then((messages) => {
        if (messages) {
          console.log('XXXX revokeInvite', messages)
          messages.forEach(message => {
            message.destroy({ useMasterKey: true })
          })
          connection.destroy({ useMasterKey: true })
          return true
        } else {
          if (connection) {
            connection.destroy({ useMasterKey: true })
            return true
          } else {
            return Parse.Promise.error('no connection')
          }
        }
      })
      .then((payload) => {
        console.log('XXXX revokeInvite final', payload)
        response.success(payload)
      })
      .catch((error) => {
        response.error(error)
      })
  } else {
    response.error("Must be logged in to revoke a person's invitation.")
  }
})

/**
 * @function acceptInvite
 * @description [usage MOBILE] accept an invitation and make the corresponding two connections as 'connected' as well as circles associated.
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.invitation - invitation to be accepted
 * @param {string} params.circles - invitation circles
 * @param {string} params.subject - invitation subject - confirm it is in use (not sent in mobile)
 * @param {string} params.message - invitation message - confirm it is in use (not sent in mobile)
 * @todo review .then structure and input parameters
 */
Parse.Cloud.define('acceptInvite', function (request, response) {
  let firstConnection
  let user = request.user
  if (!user) {
    response.error('Must be logged in to accept invite.')
  } else if (!request.params.invitation) {
    response.error('Must pass valid message id to accept invite.')
  } else if (!request.params.circles) {
    response.error('Must pass in circle(s) to accept invite.')
  } else {
    // PARAMS
    console.log('inviteAccept: 0. Request object', request)
    console.log('------------------------------------')
    console.log('inviteAccept: 1. Params OK', typeof (request.params.circles))
    console.log('------------------------------------')
    let circleIds = Array.isArray(request.params.circles) ? request.params.circles : [request.params.circles]
    let invitationId = request.params.invitation
    console.log('acceptInvite circleIds var', JSON.stringify(circleIds))
    console.log('acceptInvite invitationId var', invitationId)

    // SETVARS
    let circles, invitation, connection
    console.log('------------------------------------')
    console.log('2. SETVARS')
    console.log('------------------------------------')
    let messageData = {
      subject: request.params.subject, // nklein
      message: request.params.message // nklein: changed to receive info from public
    }
    // MESSAGEDATA
    console.log('------------------------------------')
    console.log('3. MESSAGEDATA: subject: ', messageData.subject)
    console.log('4. MESSAGEDATA: message: ', messageData.message)
    console.log('------------------------------------')

    // MESSAGEADDRESS
    let messageAddress = {}
    Message.fetchMessage(user, invitationId)
      .then(
        function (foundMessage) {
          invitation = foundMessage
          console.log('5. Invitation', invitation)
          messageAddress = invitation ? invitation.returnAddress() : ''
        },
        function (error) {
          response.error(error)
        }
      ).then(
        function () {
          console.log('6. CIRCLEIDS: ', circleIds)
          console.log('------------------------------------')
          return Circle.circlesFromIds(user, circleIds)
        }
      ).then(
        function (foundCircles) {
          // FOUNDCIRCLES
          circles = foundCircles
          console.log('------------------------------------')
          console.log('11. FOUNDCIRCLES circles: ', circles[0].id)
          console.log('------------------------------------')
          return Circle.messageDataFromCircles(user, circles, messageData)
        },
        function (error) {
          response.error(error)
        }
      ).then(
        function (finalMessageData) {
          // FINALMESSAGEDATA - SET eTag
          messageData = finalMessageData
          console.log('------------------------------------')
          console.log('12. CREATE INVERSE CONNECTION FROM MESSAGE')
          console.log('------------------------------------')
          connection = Connection.newConnectionFromMessage(user, invitation, circles)
          connection.sendConnectionMessage(user, messageAddress, messageData, 'accept')
          return connection
        },
        function (error) {
          response.error(error)
        }
      ).then(
        function (conn) {
          firstConnection = conn
          // SET MESSAGE READ TO TRUE
          console.log('------------------------------------')
          console.log('13. SET MESSAGE READ TO TRUE')
          console.log('------------------------------------')
          invitation.set('read', true)
          return invitation.save(null, { useMasterKey: true })
        },
        function (error) {
          response.error(error)
        }
      ).then(
        function () {
          // SET STATUS & SAVE - connected, etag, toPerson, name
          let query = new Parse.Query(Connection)
          query.equalTo('messages', invitation)
          query.equalTo('status', 'pending')

          return query.first({ useMasterKey: true }
          ).then(
            function (invitationConnection) {
              console.log('------------------------------------')
              console.log('15. SET STATUS FOR DIRECT CONNECTION & SAVE - connected, etag, toPerson, name', invitationConnection.get('toPerson'), user)
              console.log('------------------------------------')
              let acl = invitationConnection.getACL()
              acl.setReadAccess((invitationConnection.get('toPerson') ? invitationConnection.get('toPerson').id : user.id), true)
              acl.setWriteAccess((invitationConnection.get('toPerson') ? invitationConnection.get('toPerson').id : user.id), true)
              invitationConnection.setACL(acl)
              invitationConnection.set('status', 'connected')
              invitationConnection.set('toPerson', user)
              invitationConnection.set('name', invitation.get('toName'))
              invitationConnection.set('inverseConnection', connection)
              return invitationConnection.save(null, { useMasterKey: true })
            })
            .then((invitationConnection) => {
              firstConnection.set('inverseConnection', invitationConnection)
              return firstConnection.save(null, { useMasterKey: true })
            }
            ).then(() => {
              let Uquery1 = new Parse.Query(Parse.User)
              let Uquery2 = new Parse.Query(Parse.User)
              Uquery1.equalTo('objectId', user.id)
              Uquery1.first({ useMasterKey: true })
                .then((thisUser) => {
                  console.log('START activateFlagForUsersinCircle:1', user)
                  thisUser.set('newConnectionsFlag', true)
                  thisUser.save(null, { useMasterKey: true })
                })
              Uquery2.equalTo('objectId', invitation.get('fromPerson'))
              Uquery2.first({ useMasterKey: true })
                .then((thisUser) => {
                  console.log('START activateFlagForUsersinCircle2:', invitation.get('fromPerson'))
                  thisUser.set('newInvitationsFlag', true)
                  thisUser.save(null, { useMasterKey: true })
                })
            })
        },
        function (error) {
          response.error(error)
        }
      ).then( // return the new connection
        function (object) {
          response.success(connection)
        },
        function (error) {
          response.error(error)
        }
      )
  }
})

/**
 * @function declineInvite
 * @description [usage MOBILE] Decline an invitation
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.invitation - invitation to be declined
 * @todo review .then structure and input parameters
 */
Parse.Cloud.define('declineInvite', function (request, response) {
  if (request.user && request.params.invitation) {
    let invitationId = request.params.invitation
    let invitation
    let user = request.user
    console.log('fetching message')
    Message.fetchMessage(user, invitationId).then(
      foundMessage => {
        console.log('fetched message ' + JSON.stringify(foundMessage))
        invitation = foundMessage
      }
    ).then(
      (object) => {
        console.log('sent decline message')
        invitation.set('read', true)
        console.log('saving invitation as read')
        return invitation.save(null, { useMasterKey: true })
      }
    ).then((object) => {
      let query = new Parse.Query(Connection)
      query.equalTo('messages', invitation)
      query.equalTo('status', 'pending')
      return query.first({ useMasterKey: true }
      ).then(
        function (connection) {
          connection.set('status', 'declined')
          return connection.save(null, { useMasterKey: true })
        })
        .then(
          function (message) {
            console.log('saved connection as declined')
            response.success(message)
          },
          function (error) {
            response.error(error)
          }
        )
    })
  } else {
    response.error('Must be logged in, pass message to decline invite.')
  }
})

/**
 * @function inviteCheck
 * @description [usage WEB] check for a specific invite id for an email or phone (used in parse web for now)
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.email - check for a user with this email
 * @param {string} params.phone - check for a user with this email
 * @param {string} params.id - check for an invite with this id
 * @todo confirm importance of email and phone params, they seem no to be used...
 */
Parse.Cloud.define('inviteCheck', function (request, response) {
  User.findUser(null, request.params.email, request.params.phone).then(
    foundUser => {
      let query = new Parse.Query('Message')
      query.equalTo('objectId', request.params.id)
      query.equalTo('kind', 'invite')
      query.equalTo('read', false)
      return query.first({ useMasterKey: true })
        .then((invitation) => {
          if (invitation) {
            return response.success(invitation)
          }
          return response.error('no invite')
        })
        .catch(() => {
          return response.error('no invite')
        })
    }
  ).catch((error) => {
    return response.error(error)
  })
})

/**
 * @function getAvailableInvites
 * @description [usage MOBILE] used to get invites available for a User
 * @kind Cloud Function
 * @todo
 */
Parse.Cloud.define('getAvailableInvites', async (request, response) => {
  if (!request.user) {
    return response.error('Must be signed up and logged in to call getAvailableInvites.')
  }

  try {
    const user = request.user

    const config = await Parse.Config.get()
    // Default total users limit is 10000
    const totalUsersLimit = config.get('usersLimit') || 10000

    const queryAllUsers = new Parse.Query(Parse.User)
    const totalNumberOfUsers = await queryAllUsers.count({ useMasterKey: true })

    if (totalNumberOfUsers > totalUsersLimit) {
      return response.success({ availableInvites: 0 })
    }

    const queryPending = new Parse.Query('Connection')
    queryPending.equalTo('status', 'pending')
    queryPending.equalTo('fromPerson', user)
    const currentPending = await queryPending.count({ useMasterKey: true })
    const pendingLimit = user.get('defaultPendingConns')

    // Each available number should be >= 0
    const userAvailableInvites = Math.max(pendingLimit - currentPending, 0)
    const totalAvailableUsers = Math.max(totalUsersLimit - totalNumberOfUsers, 0)

    return response.success({ availableInvites: Math.min(userAvailableInvites, totalAvailableUsers) })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function getInviteDetails
 * @description [usage MOBILE] Get invite details (connection) of current user
 * @kind Cloud Function
 * @param {string} params.id - invite iud
 * @todo
 */
Parse.Cloud.define('getInviteDetails', async function (request, response) {
  const user = request.user
  if (!user) {
    return response.error('Must be loged in to request getInviteDetails')
  }

  try {
    const innerQuery = new Parse.Query('Message')
    innerQuery.equalTo('kind', 'invite')
    innerQuery.equalTo('objectId', request.params.id)

    const query = new Parse.Query('Connection')
    query.matchesQuery('messages', innerQuery)
    query.notEqualTo('fromPerson', user)

    const connection = await query.first({ useMasterKey: true })
    if (!connection) {
      return response.error('Invite is not found')
    }

    if (connection.get('toPerson') && connection.get('toPerson').id !== user.id) {
      return response.error('Invite belongs to another user')
    }

    return response.success(connection)
  } catch (err) {
    response.error(err)
  }
})
