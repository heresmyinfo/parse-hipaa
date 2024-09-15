/* global Parse */

var general = require('./general.js')

/**
 * @class Connection
 * @description Represents a connection between one user and another
 */
class Connection extends Parse.Object {
  constructor () {
    super('Connection')
  }

  // Instance methods

  /**
   * @memberof Connection
   * @instance
   */
  findMessagesOfKind (messageKind) {
    var query = this.relation('messages').query()
    query.equalTo('kind', messageKind)
    return query.find()
  }

  /**
   * @memberof Connection
   * @instance
   */
  findInvite () {
    return this.findMessagesOfKind('invite')
  }

  /**
   * @memberof Connection
   * @instance
   */
  findAccept () {
    return this.findMessagesOfKind('accept')
  }

  /**
   * @memberof Connection
   * @instance
   */
  sendConnectionMessage (user, messageAddress, messageData, messageKind) {
    var Message = require('./message.js')
    var locMessage
    var toPerson
    var connection = this
    var messages = connection.relation('messages')
    return Message.sendMessage(user, messageAddress, messageData, messageKind)
      .then((message) => {
        console.log('sendConnectionMessage message', message)
        if (message === 'blocked') {
          connection.destroy({ useMasterKey: true })
          return Parse.Promise.as('blocked')
        }
        locMessage = message
        toPerson = message.get('toPerson')
        messages.add(message)
        if (toPerson) {
          connection.set('toPerson', toPerson)
        }
        connection.save(null, { useMasterKey: true })
        return locMessage.id
      })
      .then((messageId) => {
        return messageId
      })
      .catch((error) => {
        console.log('Error sendConnectionMessage: ', error)
        return Parse.Promise.error(error)
      })
  }

  /**
   * @memberof Connection
   * @instance
   */
  setConnectionAddress (fromAddress) {
    if (fromAddress.toName) { this.set('name', fromAddress.toName) }
    if (fromAddress.toPerson) { this.set('toPerson', fromAddress.toPerson) }
    if (fromAddress.email) { this.set('email', fromAddress.email) }
    if (fromAddress.phone) { this.set('phone', general.normalizePhone(fromAddress.phone)) }
  }

  /**
   * @memberof Connection
   * @instance
   */
  receiveMessage (message) {
    var promise = new Parse.Promise()
    var messages
    var address = {}
    var self = this
    message.set('read', true)
    messages = self.relation('messages')
    messages.add(message)
    message.save(null, { useMasterKey: true }).then(
      function (savedMessage) {
        address = message.returnAddress()
        self.setConnectionAddress(address)
        return self.save(null, { useMasterKey: true })
      }
    ).then(
      function () {
        promise.resolve(self)
      },
      function (error) {
        promise.reject(error)
      }
    )
    return promise
  }

  /**
   * @memberof Connection
   * @instance
   */
  containsCircle (circleId) {
    var circleIds = []

    _.each(this.get('circles'), function (circle) {
      return circleIds.push(circle.id)
    })

    return (circleIds.indexOf(circleId) > -1)
  }

  // Class methods

  static connectionsFromIds (connectionIds) {
    var connections = []

    _.each(connectionIds, function (connectionId) {
      connections.push(Connection.createWithoutData(connectionId))
    })

    return Connection.fetchAllIfNeeded(connections)
  }

  /**
   * @memberof Connection
   */
  static newConnection (user, messageAddress, circles) {
    console.log('XXXXX newConnection ')
    var connection = new Connection()
    connection.set('status', 'pending')

    connection.setACL(new Parse.ACL(user))

    connection.set('fromPerson', user)
    connection.set('toPerson', null)
    connection.set('circles', circles)

    connection.setConnectionAddress(messageAddress)

    return connection
  }

  /**
   * @memberof Connection
   */
  static newConnectionFromMessage (user, message, circles) {
    var connection = new Connection()
    var returnAddress, messages
    const acl = new Parse.ACL(user)
    acl.setReadAccess(message.get('fromPerson'), true)
    acl.setWriteAccess(message.get('fromPerson'), true)
    connection.setACL(acl)
    console.log('XXXXX newConnectionFromMessage adding ACL', acl, message, message.get('fromPerson'), message.get('toPerson'))
    connection.set('fromPerson', user)
    connection.set('toPerson', null)
    connection.set('circles', circles)
    connection.set('status', 'connected')
    connection.set('inverseConnection', this.id)

    returnAddress = message.returnAddress()
    connection.setConnectionAddress(returnAddress)

    messages = connection.relation('messages')
    messages.add(message)

    return connection
  }

  /**
   * @memberof Connection
   * @description find a connection - used to match a connection to a message before message is added
   * to the messages relation
   */
  static findConnection (address, connectionStatus) {
    var promise = new Parse.Promise()

    var query
    var toPersonQuery
    var emailQuery
    var phoneQuery

    if (address.toPerson) {
      toPersonQuery = new Parse.Query(Connection)
      toPersonQuery.equalTo('toPerson', address.toPerson)
      console.log('constructed toPersonQuery')
    }
    if (address.email) {
      emailQuery = new Parse.Query(Connection)
      emailQuery.equalTo('email', address.email)
      console.log('constructed emailQuery')
    }
    if (address.phone) {
      phoneQuery = new Parse.Query(Connection)
      phoneQuery.equalTo('phone', address.phone)
      console.log('constructed phoneQuery')
    }

    if (address.toPerson && address.email && address.phone) {
      query = Parse.Query.or(toPersonQuery, emailQuery, phoneQuery)
    } else if (address.toPerson && address.email) {
      query = Parse.Query.or(toPersonQuery, emailQuery)
    } else if (address.toPerson && address.phone) {
      query = Parse.Query.or(toPersonQuery, phoneQuery)
    } else if (address.email && address.phone) {
      query = Parse.Query.or(emailQuery, phoneQuery)
    } else if (address.toPerson) {
      query = toPersonQuery
    } else if (address.email) {
      query = emailQuery
    } else if (address.phone) {
      query = phoneQuery
    } else {
      promise.reject('findConnection missing toPerson, email and phone')
      return promise
    }

    if (connectionStatus) { query.equalTo('status', connectionStatus) }

    query.first({ useMasterKey: true }).then(
      function (connection) {
        promise.resolve(connection)
      },
      function (error) {
        promise.reject(error)
      }
    )

    return promise
  }

  /**
   * @description Find any "connected" connection between 2 defined persons or any state connection with the same "to" Params
   * @memberof Connection
   */
  static findConnectionByPersonsOrParams (fromPerson, toPerson, email, phone, connectionStatus) {
    var promise = new Parse.Promise()

    var query
    var toPersonQuery
    var emailQuery
    var phoneQuery

    if (toPerson) {
      toPersonQuery = new Parse.Query(Connection)
      toPersonQuery.equalTo('toPerson', toPerson)
      if (connectionStatus) {
        toPersonQuery.equalTo('status', connectionStatus)
      }
      console.log('constructed toPersonQuery')
    }
    if (email) {
      emailQuery = new Parse.Query(Connection)
      emailQuery.equalTo('email', email)
      console.log('constructed emailQuery')
    }
    if (phone) {
      phoneQuery = new Parse.Query(Connection)
      phoneQuery.equalTo('phone', phone)
      console.log('constructed phoneQuery')
    }

    if (toPerson && email && phone) {
      query = Parse.Query.or(toPersonQuery, emailQuery, phoneQuery)
    } else if (toPerson && email) {
      query = Parse.Query.or(toPersonQuery, emailQuery)
    } else if (toPerson && phone) {
      query = Parse.Query.or(toPersonQuery, phoneQuery)
    } else if (email && phone) {
      query = Parse.Query.or(emailQuery, phoneQuery)
    } else if (toPerson) {
      query = toPersonQuery
    } else if (email) {
      query = emailQuery
    } else if (phone) {
      query = phoneQuery
    } else {
      promise.reject('findConnection missing toPerson, email and phone')
      return promise
    }

    query.equalTo('fromPerson', fromPerson)
    query.first({ useMasterKey: true })
      .then((connection) => {
        promise.resolve(connection)
      })
      .catch((error) => {
        promise.reject(error)
      })
    return promise
  }

  /**
   * @description receive message TODO look for already processed
   * @memberof Connection
   */
  static receiveMessageSetStatus (message, newStatus) {
    var promise = new Parse.Promise()
    var connection
    var address = message.returnAddress()

    // find the connection and receive the message
    Connection.findConnection(address, null).then(
      function (foundConnection) {
        connection = foundConnection
        if (connection) {
          if (newStatus) { connection.set('status', newStatus) }
          return connection.receiveMessage(message)
        } else {
          promise.reject('no connection found for message')
        }
      }
    ).then(
      function (savedConnection) {
        promise.resolve(savedConnection)
      },
      function (error) {
        promise.reject(error)
      }
    )

    return promise
  }

  /**
   * fetch invite message
   * @memberof Connection
   */
  static fetchInvite (connection) {
    console.log('running fetchInvite for this connection')
    var promise = new Parse.Promise()
    var query = connection.relation('messages').query()
    query.equalTo('kind', 'invite')
    query.first({ useMasterKey: true })
      .then(function (invite) {
        console.log('fetchedInvite: ' + JSON.stringify(invite))
        promise.resolve(invite)
      }, function (error) {
        promise.reject(error)
      })
    return promise
  }

  /**
   * @description get a string representing contactCards
   * associated with a given list of connections
   * @memberof Connection
   */
  static toContactTables (connections) {
    var promise = new Parse.Promise()
    var invites = []
    var invitesReady = []
    console.log('passed into toContactTables: ' + JSON.stringify(connections))
    _.each(connections, function (connection) {
      console.log('iterating over connection: ' + JSON.stringify(connection))
      var promise = new Parse.Promise()
      Connection.fetchInvite(connection)
        .then(function (invite) {
          invites.push(invite)
          promise.resolve()
        }, function (error) {
          promise.reject(error)
        })
      invitesReady.push(promise)
    })
    Parse.Promise.when(invitesReady).then(function () {
      console.log('invites ready')
    }, function (error) {
      promise.reject(error)
    })
    return promise
  }

  /**
   * @memberof Connection
   */
  static findConnectionsWithCircles (circleIds) {
    var circleIdsArrayLength = circleIds.length
    var query = new Parse.Query('Connection')
    var promise = new Parse.Promise()
    var connectionsWithCircles = []
    console.log('circleIdsArrayLength : ' + circleIdsArrayLength)
    query.find()
      .then(
        function (connections) {
          if (connections) {
            var connectionsArrayLength = connections.length
            console.log('connectionsArrayLength : ' + connectionsArrayLength)
            for (var i = 0; i < connectionsArrayLength; i++) {
              for (var j = 0; j < circleIdsArrayLength; j++) {
                if (connections[i].containsCircle(circleIds[j])) {
                  connectionsWithCircles.push(connections[i].id)
                  break
                }
              }
            }
            return promise.resolve(connectionsWithCircles)
          } else {
            return promise.resolve('no connections found')
          }
        },
        function (error) {
          promise.reject(error)
        }
      )
    return promise
  }
}

Parse.Object.registerSubclass('Connection', Connection)
/**
 * @function shareCircleToConnection
 * @description [usage MOBILE] Share a specific circle from a user, given a connection shared with him
 * This implies a unique circle per connection - it can/should be changed later
 * PRL
 * Updating to allow multiple circles per Connection
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.inverseConnectionId - connection shared with the user
 * @param {string} params.circleId - Circleid to be shared
 * @todo
 */
Parse.Cloud.define('shareCircleToConnection', function (request, response) {
  const inverseConnectionId = request.params.inverseConnectionId
  const circleId = request.params.circleId
  console.log('shareCircleToConnection cloud code', inverseConnectionId, circleId)
  let circle
  let invConnection, updatedConnection
  var queryCircle = new Parse.Query(Circle)
  var queryInvConn = new Parse.Query(Connection)
  queryCircle.get(circleId, { useMasterKey: true })
    .then((thisCircle) => {
      circle = thisCircle
      console.log('shareCircleToConnection cloud code 0', circle)
      return queryInvConn.get(inverseConnectionId, { useMasterKey: true })
    })
    .then((foundInvConnection) => {
      invConnection = foundInvConnection
    })
    .then(() => {
      console.log('shareCircleToConnection cloud code 1', invConnection)
      var query = new Parse.Query(Connection)
      query.include('circles')
      query.equalTo('toPerson', invConnection.get('fromPerson'))
      query.equalTo('fromPerson', invConnection.get('toPerson'))
      return query.first({ useMasterKey: true })
    })
    .then((foundConnection) => {
      const connection = foundConnection
      console.log('shareCircleToConnection cloud code 2', foundConnection)
      connection.removeAll('circles', connection.get('circles'))
      return connection.save(null, { useMasterKey: true })
    })
    .then((savedConnection) => {
      console.log('shareCircleToConnection cloud code 2.5', savedConnection.get('circles'))
      savedConnection.add('circles', circle)
      return savedConnection.save(null, { useMasterKey: true })
    })
    .then((savedConnection) => {
      updatedConnection = savedConnection
      console.log('saved connection: ', invConnection.get('fromPerson'), invConnection.get('fromPerson').id)
      const query = new Parse.Query(Parse.User)
      query.equalTo('objectId', invConnection.get('fromPerson').id)
      return query.first({ useMasterKey: true })
    })
    .then((thisUser) => {
      thisUser.set('newConnectionsFlag', true)
      return thisUser.save(null, { useMasterKey: true })
    })
    .then(() => {
      return response.success(updatedConnection)
    })
    .catch((error) => {
      response.error(error)
    })
})

/**
 * @function getConnectionsForUser
 * @description [usage MOBILE] For a user get connections where he is beeing the toPerson, together a full set of
 *  properties from shared circle (without explicit send the circle) and the related
 *  inverse connection circle
 * @kind Cloud Function
 * @param {object} params
 * @param {boolean} params.updated -  only recently updated connections flag
 * @todo
 */
Parse.Cloud.define('getConnectionsForUser', function (request, response) {
  var query = new Parse.Query('Connection')
  var output = []
  var user = request.user
  console.log('request.user: ', user)
  query.include('circles')
  query.include('circles.properties')
  query.include('inverseConnection')
  query.include('inverseConnection.circles')
  query.equalTo('status', 'connected')

  if (request.params.updated) {
    query.equalTo('updateFlag', true)
  }
  query.equalTo('toPerson', user)
  query.find({ useMasterKey: true }
  ).then(function (connections) {
    console.log('fetched connections: ', connections)
    _.each(connections, function (connection) {
      connection.set('updateFlag', false)
      connection.save(null, { useMasterKey: true })
      const conn = connection.toJSON()
      console.log('[getConnectionsForUser] conn ', conn.objectId)

      if (conn.circles) {
      // TODO: add properties from several circles
      // Conn.circles have all circles being shared with inverse connection
        console.log('conn.circles: ', conn.circles)

        conn.circles.forEach((circle) => {
          console.log('XXX circle: ', circle)
          if (circle.properties) {
            circle.properties.push({ name: 'objectId', value: conn.objectId })
            const invConn = connection.get('inverseConnection')
            const invCircles = invConn && invConn.get('circles')
            // const invCirclesJson = invCircles.toJSON()
            console.log('invCircles', invCircles)
            console.log('invCircles[]', invCircles[0].id)
            // console.log('invCircles', invCircles[0].Circle)

            const invCircleId = (invCircles && invCircles[0].id) ? invCircles[0].id : null
            console.log('invCircleId', invCircleId)
            circle.properties.push({ name: 'ownCircleShared', objectId: 'OBJECTIDHOLDER', value: invCircleId })
            circle.properties.push({
              name: 'personalNote',
              // Need to add Parse OID generator for randomized ObjectId
              objectId: 'PERSONALNOTEID',
              value: connection.get('inverseConnection') ? connection.get('inverseConnection').get('fromPersonPersonalNote') : null
            })
            output.push(circle.properties)

            console.log('OUTPUT SO FAR', output)
          }
        })
      }
      console.log('XXXX circles output', output)
    })

    // query = new Parse.Query(Parse.User)
    // query.equalTo('objectId', request.user.id)
    return response.success(output)
  })
    .catch((error) => {
      return response.error(error)
    })
})

/**
 * @function getIncomingInvitesForUser
 * @description [usage MOBILE] Get "incoming invites" for user (toPerson field) or without any toPerson yet assigned
 *  added up with context fields
 * @kind Cloud Function
 * @todo
 */
Parse.Cloud.define('getIncomingInvitesForUser', function (request, response) {
  var eqquery = new Parse.Query('Connection')
  var nullquery = new Parse.Query('Connection')
  var output = []
  console.log('XXXXX Start Incoming Invites XXX', request.user)
  eqquery.equalTo('toPerson', request.user)
  eqquery.include('fromPerson.profile')
  eqquery.include('fromPerson.profile.properties')
  eqquery.include('toPerson')
  nullquery.doesNotExist('toPerson')
  nullquery.include('fromPerson.profile')
  nullquery.include('fromPerson.profile.properties')
  nullquery.include('toPerson')

  const mainQuery = Parse.Query.or(eqquery, nullquery)
  mainQuery.find({ useMasterKey: true }
  ).then(function (invites) {
    console.log('[Incoming] all invites ', invites)
    Promise.all(
      invites.map((invite) => {
        console.log('[Incoming] invite: ', invite)
        var circles = invite.get('circles')
        var connId = invite.id
        var status = invite.get('status')
        const msg = invite.relation('messages').query()
        msg.equalTo('kind', 'invite')
        msg.equalTo('toPerson', request.user)
        return msg.find({ useMasterKey: true })
          .then(function (messages) {
            console.log('[Incoming] messages: ', messages)
            messages.forEach((message) => {
              output.push({
                name: message.toJSON().fromName,
                email: message.toJSON().email,
                createdAt: message.toJSON().createdAt,
                invitation: message.id,
                inviteStatus: status,
                message: message.toJSON().message,
                subject: message.toJSON().subject,
                circles: circles[0].id,
                profile: invite.get('fromPerson').get('profile'),
                connectionId: connId
              })
            })
          })
      })
    )
      .then(() => {
        const query = new Parse.Query(Parse.User)
        query.equalTo('objectId', request.user.id)
        query.first({ useMasterKey: true })
          .then((thisUser) => {
            thisUser.set('newInvitationsFlag', false)
            return thisUser.save(null, { useMasterKey: true })
          })
          .then(() => {
            console.log('XXXXX OUTPUT incoming', output)
            return response.success(output)
          })
      }
      ).catch(function (error) {
        response.error('ALL Error', error)
      })
  })
})

/**
 * @function getOutGoingInvitesForUser
 * @kind Cloud Function
 * @description [usage MOBILE] Get "outgoing invites" for user
 *  added up with context fields
 * @todo
 */
Parse.Cloud.define('getOutGoingInvitesForUser', function (request, response) {
  console.log('XXXXX Start Outgoing Invites XXX', request.user)
  var query = new Parse.Query('Connection')
  var output = []
  query.equalTo('fromPerson', request.user)
  query.include('fromPerson.profile')
  query.include('fromPerson.profile.properties')
  query.include('toPerson')
  query.find({ useMasterKey: true }
  ).then(function (invites) {
    Promise.all(
      invites.map((invite) => {
        console.log('[Outgoing] invite: ', invite)
        var circles = invite.get('circles')
        var status = invite.get('status')
        var connId = invite.id
        const inverseConnection = (invite.get('inverseConnection') || {}).id
        const msg = invite.relation('messages').query()
        msg.equalTo('kind', 'invite')
        msg.equalTo('fromPerson', request.user)
        return msg.find({ useMasterKey: true })
          .then((messages) => {
            console.log('[Outgoing] messages: ', messages)
            messages.forEach((message) => {
              output.push({
                name: message.toJSON().toName,
                email: message.toJSON().email,
                phone: message.toJSON().phone,
                createdAt: message.toJSON().createdAt,
                invitation: invite.id,
                inviteStatus: status,
                message: message.toJSON().message,
                subject: message.toJSON().subject,
                circles: circles[0].id,
                profile: invite.get('fromPerson').get('profile'),
                connectionId: connId,
                inverseConnection
              })
            })
          })
      })
    ).then(() => {
      console.log('XXXXX OUTPUT Outgoing ', output)
      response.success(output)
    }
    ).catch(function (error) {
      response.error('ALL Error', error)
    })
  })
})

/**
 * @function disconnectConnection
 * @kind Cloud Function
 * @description [usage MOBILE] Delete the connection
 * @todo For now we completely delete the connection since the behaviour with status is not consistent across the app
 */
Parse.Cloud.define('disconnectConnection', function (request, response) {
  const connectionId = request.params.connectionId
  Parse.Cloud.run(
    'deleteConnections',
    { connections: [connectionId] },
    { useMasterKey: true }
  )
    .then(result => response.success(result))
    .catch(error => response.error(error))
})

/**
 * @function setPersonalNote
 * @kind Cloud Function
 * @description [usage MOBILE] Set a Personal Note about a specific user in a connection
 *  the right connection is found looking at the id as the connection Id or the inverseConnection Id,
 *  but looking at the user as the "fromPerson"
 */
Parse.Cloud.define('setPersonalNote', function (request, response) {
  const query = new Parse.Query('Connection')
  const queryInverse = new Parse.Query('Connection')
  query.equalTo('objectId', request.params.connectionId)
  query.equalTo('fromPerson', request.user.id)
  query.first({ useMasterKey: true })
    .then((connection) => {
      if (connection) {
        connection.set('fromPersonPersonalNote', request.params.note)
        connection.save(null, { useMasterKey: true })
      } else {
        queryInverse.equalTo('inverseConnection', request.params.connectionId)
        queryInverse.equalTo('fromPerson', request.user.id)
        return queryInverse.first({ useMasterKey: true })
          .then((connection) => {
            if (connection) {
              connection.set('fromPersonPersonalNote', request.params.note)
              connection.save(null, { useMasterKey: true })
            } else {
              throw new Error('no connection found with id ', request.params.connectionId, request.user.id)
            }
          })
          .catch((error) => {
            console.log('disconnectConnection error', error)
            response.error(error)
          })
      }
    })
    .then(() => {
      response.success(true)
    }).catch((error) => {
      console.log('disconnectConnection error getting conection', error)
      response.error(error)
    })
})

/**
 * @function getCirclesForConnection
 * @description [usage MOBILE] For a user get connections where he is beeing the toPerson, together a full set of
 *  properties from shared circle (without explicit send the circle) and the related
 *  inverse connection circle
 * @kind Cloud Function
 * @param {object} params
 * @param {boolean} params.updated -  only recently updated connections flag
 * @todo
 */

Parse.Cloud.define('getCirclesForConnection', function (request, response) {
  var query = new Parse.Query('Connection')
  var output = []
  var user = request.user
  query.include('circles')
  query.include('circles.properties')
  query.include('inverseConnection')
  query.include('inverseConnection.circles')
  query.equalTo('status', 'connected')
  if (request.params.updated) {
    query.equalTo('updateFlag', true)
  }
  query.equalTo('toPerson', user)
  query.find({ useMasterKey: true }
  ).then(function (connections) {
    console.log('fetched connections: ', connections)
    _.each(connections, function (connection) {
      console.log('underScore Connection:', connection)

      connection.set('updateFlag', false)
      connection.save(null, { useMasterKey: true })
      const conn = connection.toJSON()
      console.log('conn.objectId:  ', conn.objectId)
      // console.log('conn keys: ', Object.keys(conn))
      // console.log('conn.inverseConnection.circles: ', conn.inverseConnection.circles)
      const currentInverseConnectionCircles = conn.inverseConnection.circles
      // console.log('conn.circles: ', conn.circles)

      if (currentInverseConnectionCircles) {
        console.log('currentInverseConnectionCircles: ', currentInverseConnectionCircles)
        // TODO: add properties from several circles
        conn.circles.forEach((circle) => {
          if (circle.properties) {
            circle.properties.push({ name: 'objectId', value: conn.objectId })

            const invCircle = (connection.get('inverseConnection') && connection.get('inverseConnection').get('circles')) ? connection.get('inverseConnection').get('circles')[0] : null
            const invCircleId = (invCircle && invCircle.toJSON) ? invCircle.toJSON().objectId : null
            console.log('invCircle:', invCircle)
            circle.properties.push({ name: 'ownCirclesShared', value: invCircleId })
            circle.properties.push({
              name: 'personalNote',
              value: connection.get('inverseConnection') ? connection.get('inverseConnection').get('fromPersonPersonalNote') : null
            })
            output.push(circle.properties)
          }
        })
      }
      console.log('XXXX circles final', output)
    })
    // query = new Parse.Query(Parse.User)
    // query.equalTo('objectId', request.user.id)
    return response.success(output)
  })
    .catch((error) => {
      return response.error(error)
    })
})

module.exports = Connection

var _ = require('underscore')
var Circle = require('./circle.js')
var Message = require('./message.js')
