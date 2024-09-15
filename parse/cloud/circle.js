/* global Parse */

var _ = require('underscore')
var mp = require('./mix.js')
var Property = require('./property.js')
var Profile = require('./profile.js')

/**
 * @class Circle
 * @description Mapping to selected Properties which can be bundled
 *  into a contact card and shared with Connections
 */
class Circle extends Parse.Object {
  constructor () {
    super('Circle')
  }

  // Instance methods

  /**
   * @method getNameString
   * @description Concatenate name part properties to build a full name string
   * @instance
   * @memberof Circle
   * @todo
   */
  getNameString (user) {
    var promise = new Parse.Promise()
    return Property.getNameParts(user, this.get('properties'))
      .then(
        function (nameParts) {
          return Property.buildFullNameString(nameParts)
        }
      ).then(
        function (fullName) {
          return promise.resolve(fullName)
        },
        function (error) {
          return promise.reject(error)
        }
      )
  }

  /**
   * @method getPrimaryEmail
   * @description Get the first email in this circle's properties
   * @instance
   * @memberof Circle
   * @todo
   */
  getPrimaryEmail (user) {
    return this.getFirstPropertyWithName('emailAddresses')
      .then(
        function (property) {
          if (property) { return property.get('value') } else if (user) { return user.get('email') } else { return '' }
        },
        this.displayError
      )
  }

  /**
   * @method getPrimaryPhone
   * @description get the first phone in this circle's properties
   * @instance
   * @memberof Circle
   * @todo
   */
  getPrimaryPhone () {
    return this.getFirstPropertyWithName('phoneNumbers')
      .then(
        function (property) {
          if (property) { return property.get('value') } else { return '' }
        },
        this.displayError
      )
  }

  /**
   * @method getFirstPropertyWithName
   * @description get first property with the given name
   * @instance
   * @memberof Circle
   * @param {string} propertyName - name of the property to find
   * @todo
   */
  getFirstPropertyWithName (propertyName) {
    var query = new Parse.Query('Property')

    query
      .containedIn('objectId', this.getPropertyIDs())
      .equalTo('name', propertyName)

    return query.first({ useMasterKey: true })
  }

  /**
   * @method getPropertyIDs
   * @description get the ids of this circle's properties
   * @instance
   * @memberof Circle
   * @todo
   */
  getPropertyIDs () {
    var arrPropertyIds = []

    _.each(this.get('properties'), function (property) {
      return arrPropertyIds.push(property.id)
    })

    return arrPropertyIds
  }

  /**
   * @method containsProperty
   * @description Returns true if the given Property is mapped to this Circle
   * @instance
   * @memberof Circle
   * @param {string} propertyId = id of property to find
   * @todo
   */
  containsProperty (propertyId) {
    var propertyIds = []

    _.each(this.get('properties'), function (property) {
      return propertyIds.push(property.id)
    })

    return (propertyIds.indexOf(propertyId) > -1)
  }

  displayError (error) {
    return console.log(error)
  }

  /**
   * @method circlesFromIds
   * @description fetch the circles from an array of circle object ids
   * @memberof Circle
   * @param {array} circleIds = ids of circles to fetch
   * @todo
   */
  static circlesFromIds (user, circleIds) {
    var circles = []

    _.each(circleIds, function (circleId) {
      circles.push(Circle.createWithoutData(circleId))
    })
    console.log('------------------------------------')
    console.log('createWithoutData circleId', circles)
    console.log('------------------------------------')
    return Circle.fetchAllIfNeeded(circles, user.sessionOptions())
  }

  /**
   * @method queryCircles
   * @description get the circles represented by an array of circle object ids
   * @memberof Circle
   * @param {array} circleIds = ids of circles to find
   * @todo
   */
  static queryCircles (circleIds) {
    var query = new Parse.Query('Circle')

    query.containedIn('objectId', circleIds)

    return query.find()
  }

  /**
   * @description create a new circle with the given name and properties
   *  NOTE: this does not save the new circle
   * @memberof Circle
   * @param {string} name - the new circle's name
   * @param {array} properties - properties mapped to the new circle
   */
  static newCircleWithProperties (user, name, properties, circleOrder) {
    var circle = new Circle()
    circle.setACL(new Parse.ACL(user))
    circle.set('name', name)
    circle.set('properties', properties)
    circle.set('order', circleOrder)

    return circle
  }

  static getCircleByName (user, circleName) {
    // user should be an object
    const queryUser = new Parse.Query(Parse.User)
    queryUser.include('profile')
    queryUser.include('profile.circles')
    queryUser.equalTo('objectId', user.id)
    return queryUser.first({ useMasterKey: true })
      .then((user) => {
        const userCircles = user.get('profile').get('circles')
        const namedCircles = userCircles.filter((circle) => {
          return circle.get('name') === circleName
        })
        return namedCircles.length !== 0 ? namedCircles[0] : null
      })
  }

  /**
   * @method messageDataFromCircles
   * @description construct the message data for the circles
   * @memberof Circle
   * @param {array} arrCircles - circles to share
   * @param {object} existingMessageData - existing data for message
   * @todo
   */
  static messageDataFromCircles (user, arrCircles, existingMessageData) {
    var promise = new Parse.Promise()
    var messageData = existingMessageData || {}
    var primaryCircle = {}
    var circles = []

    if (!arrCircles || arrCircles.length < 1) {
      promise.reject('missing circles to share')
      return promise
    }

    Circle.fetchAllIfNeeded(arrCircles, { useMasterKey: true }
    ).then(
      function (fetchedCircles) {
        circles = fetchedCircles
        primaryCircle = circles[0]
        console.log('fetchAllIfNeeded primaryCircle', primaryCircle)
        return primaryCircle.getNameString(user)
      }
    ).then(
      function (nameString) {
        console.log('fetchAllIfNeeded primaryCircle1', nameString)
        messageData.fromName = nameString
        return primaryCircle.getPrimaryEmail(user)
      }
    ).then(
      function (emailString) {
        console.log('fetchAllIfNeeded primaryCircle2', emailString)
        messageData.fromEmail = emailString
        return primaryCircle.getPrimaryPhone()
      }
    ).then(
      function (phoneString) {
        console.log('fetchAllIfNeeded primaryCircle3', phoneString)
        messageData.fromPhone = phoneString
        promise.resolve(messageData)
      },
      function (error) {
        console.log('fetchAllIfNeeded primaryCircle Error', error)
        promise.reject(error)
      }
    )

    return promise
  }

  /**
   * @method findCirclesWithProperties
   * @description get an array of ids for the circles which contain
   * any of the properties represented by the given ids
   * @memberof Circle
   * @param {array} propertyIds - ids of the properties to find
   * @todo
   */
  static findCirclesWithProperties (propertyIds) {
    var propertyIdsArrayLength = propertyIds.length
    var query = new Parse.Query('Circle')
    var promise = new Parse.Promise()
    var circlesWithProperties = []

    query.find()
      .then(
        function (circles) {
          if (circles) {
            var circlesArrayLength = circles.length

            for (var i = 0; i < circlesArrayLength; i++) {
              for (var j = 0; j < propertyIdsArrayLength; j++) {
                if (circles[i].containsProperty(propertyIds[j])) {
                  circlesWithProperties.push(circles[i].id)
                  break
                }
              }
            }

            return promise.resolve(circlesWithProperties)
          } else {
            return promise.resolve('no circles found')
          }
        },
        function (error) {
          promise.reject(error)
        }
      )

    return promise
  }
}

Parse.Object.registerSubclass('Circle', Circle)

/**
 * @kind cloud
 * @description Make all circles private by default (on create)
 **/
Parse.Cloud.beforeSave('Circle', async function (request, response) {
  const { object: circle } = request

  // Mark circle as non-public by default
  if (circle.isNew() && !circle.has('public')) {
    circle.set('public', false)
  }

  return response.success()
})

/**
 * @function addNewCard
 * @description [usage MOBILE] Create circle from client - used in a near future
 *  we only have 2 default circles, can't yet add a new circle
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.name - name for the Circle
 * @todo
 */
Parse.Cloud.define('addNewCard', function (request, response) {
  mp.track('addNewCard')

  if (!request.user) {
    return response.error('must be logged in to add new circle')
  }
  if (!request.params.name) {
    return response.error('missing name for new circle')
  }

  var circleName = request.params.name
  var user = request.user
  var profile = user.get('profile')

  var circleOrder = request.params.order

  console.log('AddNewCircles profile: ', profile)

  return profile.fetch({ useMasterKey: true })
    .then(
      function (profile) {
        return profile.createEmptyCircle(user, circleName, circleOrder)
      }
    ).then(
      function (circle) {
        profile.addUnique('circles', circle)
        profile.save(null, { useMasterKey: true })
        return response.success(circle)
      },
      function (error) {
        return response.error(error)
      }
    )
})

/** PRL
 * @function deleteCard
 * @description [usage MOBILE] Used on Web and Mobile
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.name - name for the Circle
 * @todo
 */
// Ask BE if this circle has Connections (Exists in Connection.circles for this user)

// If not,  display confirmWarning: Title "Delete <circle name> Card", Sentence: "This will delete this card. Ok?"
// if confirmed, send deleteCard

// If has Connections, do any Connections have <2 circles (is this the last circle?)
// If yes, display confirmAlert Title: "Cannot Delete Card", Sentence: "This will disconnect 1 or more users. Please remove everyone from this card before deleting."

// If no, display confirmWarning: Title "Delete <circle name> Card", Sentence: "This will delete this card. Ok?"
// if confirmed, send deleteCard

Parse.Cloud.define('deleteCard', function (request, response) {
  // mp.track('deleteCard')

  if (!request.user) {
    return response.error('must be logged in to get circles')
  }
  const circleId = request.params.circleId
  let allConns
  let allCircles
  const query = new Parse.Query('Circle')
  var user = request.user
  const queryConn = new Parse.Query('Connection')
  query.include('Connection')
  query.include('properties')
  queryConn.include('circles')
  queryConn.equalTo('status', 'connected')

  return query.find(user.sessionOptions())
    .then((circ) => {
      console.log('deleteCard circ object: ', circ)
      allCircles = circ.sort(function (a, b) {
        return a.id - b.id
      })

      return queryConn.find(user.sessionOptions())
        .then((conns) => {
          console.log('allConns: ', conns)
          console.log('allConns Length: ', conns.length)

          console.log('circleId', circleId)
          const connections = {}
          connections[circleId] = []
          Object.entries(conns).forEach((conn) => {
            const ids = conn[1].get('circles').map((c) => { return c.id })
            if (ids.indexOf(circleId) !== -1) {
              connections[circleId].push(conn[1])
            }
            console.log('conn:  connections[circleId]: ', conn, connections[circleId])
          })
          allConns = connections[circleId]
        })
    })
    .then(() => {
      if (allConns.length === 0) {
        console.log('allConns.length: ', allConns.length)
        console.error('XXXX No Connections Exist')

        query.get(circleId, { useMasterKey: true })
          .then((result) => {
            console.log('DELETE', result)

            result.destroy({ useMasterKey: true }).then(() => {
              return response.success({ circleId: circleId, connections: 0 })
            })
          })
      }
      if (allConns.length === 1) {
        console.log('allConns.length: ', allConns.length)
        console.error('XXXX Last Circle for connection')
        // return response.error(304, {
        //   allCircles
        // })
      }
      if (allConns.length > 1) {
        console.log('allConns.length: ', allConns.length)
        console.error('XXXX NOT last circle for connection')
        // return response.error(304, {
        //   allCircles
        // })
      }

      // console.log('getCirclesWithConnections circlesXXX: ', allCircles)
      // const connections = {}
      // allCircles.forEach((circle) => {
      //   connections[circle.id] = []
      //   Object.entries(allConns).forEach((conn) => {
      //     const ids = conn[1].get('circles').map((c) => { return c.id })
      //     if (ids.indexOf(circle.id) !== -1) {
      //       connections[circle.id].push(conn[1])
      //     }
      //     console.log('connections[circle.id]: ', connections[circle.id])
      //   })
      // })
      response.success({ circleId: circleId, connections: allConns })
    })
    .catch((error) => {
      return response.error(error)
    })
})

/** PRL
 * @function shareThisCircleOnlyToConnection
 * @description [usage MOBILE] Share a specific circle from a user, given a connection shared with him
 * This implies a unique circle per connection - it can/should be changed later
 * *** Changed/updated by PRL after updating to multiple circles
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.inverseConnectionId - connection shared with the user
 * @param {string} params.circleId - Circleid to be shared
 * @todo
 */
Parse.Cloud.define('shareThisCircleOnlyToConnection', function (request, response) {
  const inverseConnectionId = request.params.inverseConnectionId
  const circleId = request.params.circleId

  console.log('shareThisCircleOnlyToConnection cloud code', inverseConnectionId, circleId)
  let circle
  let invConnection, updatedConnection
  var queryCircle = new Parse.Query(Circle)
  var queryInvConn = new Parse.Query('Connection')

  queryCircle.get(circleId, { useMasterKey: true })
    .then((thisCircle) => {
      circle = thisCircle
      console.log('shareThisCircleOnlyToConnection cloud code 0', circle)
      return queryInvConn.get(inverseConnectionId, { useMasterKey: true })
    })
    .then((foundInvConnection) => {
      invConnection = foundInvConnection
    })
    .then(() => {
      console.log('shareThisCircleOnlyToConnection cloud code 1 InvConnection: ', invConnection)
      var query = new Parse.Query('Connection')
      query.include('circles')
      query.equalTo('toPerson', invConnection.get('fromPerson'))
      query.equalTo('fromPerson', invConnection.get('toPerson'))
      return query.first({ useMasterKey: true })
    })
    .then((foundConnection) => {
      const connection = foundConnection
      console.log('shareThisCircleOnlyToConnection found connection: ', connection)
      connection.removeAll('circles', connection.get('circles'))
    })
    .then((savedConnection) => {
      console.log('shareThisCircleOnlyToConnection saved connection before: ', savedConnection.get('circles'))
      savedConnection.add('circles', circle)
      console.log('shareThisCircleOnlyToConnection saved connection after: ', savedConnection.get('circles'))

      return savedConnection.save(null, { useMasterKey: true })
    })
    .then((savedConnection) => {
      updatedConnection = savedConnection
      console.log('shareThisCircleOnlyToConnection saved connection: ', invConnection.get('fromPerson'), invConnection.get('fromPerson').id)
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

/** PRL
 * @function getSharedCirclesForConnection
 * * NON-Updating function - just returns results for confirmation before commit
 * @description [usage MOBILE] Get circles shared with InverseConnection and save them to Redux SharedCircles
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.inverseConnectionId - connection shared with the user
 * @param {string} params.circleId - Circleid to be shared
 * @todo
 */
Parse.Cloud.define('getSharedCirclesForConnection', function (request, response) {
  const inverseConnectionId = request.params.inverseConnectionId
  console.log('getSharedCirclesForConnection request: ', request)
  console.log('getSharedCirclesForConnection inverseConnectionId', inverseConnectionId)
  let invConnection
  var queryInvConn = new Parse.Query('Connection')

  queryInvConn.get(inverseConnectionId, { useMasterKey: true })
    .then((foundInvConnection) => {
      invConnection = foundInvConnection
    })
    .then(() => {
      console.log('getSharedCirclesForConnection cloud code 1 InvConnection: ', invConnection)
      var query = new Parse.Query('Connection')
      query.include('circles')
      query.equalTo('toPerson', invConnection.get('fromPerson'))
      query.equalTo('fromPerson', invConnection.get('toPerson'))
      return query.first({ useMasterKey: true })
    })
    .then((foundConnection) => {
      const connection = foundConnection
      console.log('getSharedCirclesForConnection found connection: ', connection)
      return connection.get('circles')
    })
    .then((circles) => {
      // These are current user's shared circles
      console.log('getSharedCirclesForConnection CIRCLES: ', circles)
      response.success(circles)
    })
    .catch((error) => {
      response.error(error)
    })
})

/** PRL
 * @function getInfoShareAdditionalCardToConnection
 * @description [usage MOBILE] Share a specific circle from a user, given a connection shared with him
 * This implies a unique circle per connection - it can/should be changed later
 * *** Changed/updated by PRL after updating to multiple circles
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.inverseConnectionId - connection shared with the user
 * @param {string} params.circleId - Circleid to be shared
 * @todo
 */

Parse.Cloud.define('getInfoShareAdditionalCardToConnection', function (request, response) {
  const inverseConnectionId = request.params.inverseConnectionId
  const circleId = request.params.circleId

  console.log('getInfoShareAdditionalCardToConnection cloud code', inverseConnectionId, circleId)
  let circle
  const updatedCircles = []
  let invConnection, updatedConnection
  var queryCircle = new Parse.Query(Circle)
  var queryInvConn = new Parse.Query('Connection')

  queryCircle.get(circleId, { useMasterKey: true })
    .then((thisCircle) => {
      circle = thisCircle
      return queryInvConn.get(inverseConnectionId, { useMasterKey: true })
    })
    .then((foundInvConnection) => {
      invConnection = foundInvConnection
    })
    .then(() => {
      console.log('getInfoShareAdditionalCardToConnection cloud code 1 InvConnection: ', invConnection)
      var query = new Parse.Query('Connection')
      query.include('circles')
      query.equalTo('toPerson', invConnection.get('fromPerson'))
      query.equalTo('fromPerson', invConnection.get('toPerson'))
      return query.first({ useMasterKey: true })
    })
    .then((foundConnection) => {
      const connection = foundConnection
      connection.get('circles')
      return connection.save(null, { useMasterKey: true })
    })
    .then((savedConnection) => {
      const currentCircles = savedConnection.get('circles')
      console.log('ADD circle', circle)
      console.log('ADD circleId', circleId)
      console.log('ADD currentCircles: ', currentCircles)
      currentCircles.push(circle)
      console.log('ADD updatedCircles: ', currentCircles)
      return response.success(currentCircles)
    })
    .catch((error) => {
      response.error(error)
    })
})

/** PRL
 * @function getInfoOnlyRemoveCardFromConnection
 * @description [usage MOBILE]
 * NON-Updating function - just returns results for confirmation before commit
 * Share a specific circle from a user, given a connection shared with him
 * This implies a unique circle per connection - it can/should be changed later
 * *** Changed/updated by PRL after updating to multiple circles
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.inverseConnectionId - connection shared with the user
 * @param {string} params.circleId - Circleid to be shared
 * @todo
 */
Parse.Cloud.define('getInfoOnlyRemoveCardFromConnection', function (request, response) {
  const inverseConnectionId = request.params.inverseConnectionId
  const circleId = request.params.circleId
  let circle
  let invConnection, updatedConnection
  var queryCircle = new Parse.Query(Circle)
  var queryInvConn = new Parse.Query('Connection')

  queryCircle.get(circleId, { useMasterKey: true })
    .then((thisCircle) => {
      circle = thisCircle
      console.log('REMOVE circle', circle)
      console.log('REMOVE circleId', circleId)
      return queryInvConn.get(inverseConnectionId, { useMasterKey: true })
    })
    .then((foundInvConnection) => {
      invConnection = foundInvConnection
    })
    .then(() => {
      // console.log('getInfoOnlyRemoveCardFromConnection cloud code 1 InvConnection: ', invConnection)
      var query = new Parse.Query('Connection')
      query.include('circles')
      query.equalTo('toPerson', invConnection.get('fromPerson'))
      query.equalTo('fromPerson', invConnection.get('toPerson'))
      return query.first({ useMasterKey: true })
    })
    .then((foundConnection) => {
      // console.log('REMOVE foundConnection: ', foundConnection)
      const connection = foundConnection
      connection.get('circles')
      // console.log('REMOVE connection circles: ', connection)
      return connection.save(null, { useMasterKey: true })
    })
    .then((savedConnection) => {
      // console.log('REMOVE savedConnection: ', savedConnection)
      const currentCircles = savedConnection.get('circles')
      console.log('REMOVE currentCircles: ', currentCircles)
      // console.log('updatedCircles: ', updatedCircles)
      savedConnection.get('circles')
      const updatedCircles = currentCircles.filter((c) => {
        return c.id !== circleId
      })
      // console.log('REMOVE savedConnection: ', savedConnection)
      console.log('REMOVE updatedCircles: ', updatedCircles)
      return response.success(updatedCircles)
    })
    .catch((error) => {
      response.error(error)
    })
})

/** PRL
 * @function shareAdditionalCardToConnection
 * @description [usage MOBILE] Share a specific circle from a user, given a connection shared with him
 * This implies a unique circle per connection - it can/should be changed later
 * *** Changed/updated by PRL after updating to multiple circles
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.inverseConnectionId - connection shared with the user
 * @param {string} params.circleId - Circleid to be shared
 * @todo
 */
Parse.Cloud.define('shareAdditionalCardToConnection', function (request, response) {
  const inverseConnectionId = request.params.inverseConnectionId
  const circleId = request.params.circleId

  console.log('shareAdditionalCardToConnection cloud code', inverseConnectionId, circleId)
  let circle
  let invConnection, updatedConnection
  var queryCircle = new Parse.Query(Circle)
  var queryInvConn = new Parse.Query('Connection')

  queryCircle.get(circleId, { useMasterKey: true })
    .then((thisCircle) => {
      circle = thisCircle
      console.log('shareAdditionalCircleToConnection getCircle', circle)
      return queryInvConn.get(inverseConnectionId, { useMasterKey: true })
    })
    .then((foundInvConnection) => {
      invConnection = foundInvConnection
    })
    .then(() => {
      console.log('shareAdditionalCircleToConnection cloud code 1 InvConnection: ', invConnection)
      var query = new Parse.Query('Connection')
      query.include('circles')
      query.equalTo('toPerson', invConnection.get('fromPerson'))
      query.equalTo('fromPerson', invConnection.get('toPerson'))
      return query.first({ useMasterKey: true })
    })
    .then((foundConnection) => {
      const connection = foundConnection
      // console.log('shareAdditionalCircleToConnection found connection: ', connection)
      connection.get('circles')
      // connection.removeAll('circles', connection.get('circles'))
      return connection.save(null, { useMasterKey: true })
    })
    .then((savedConnection) => {
      console.log('savedConnection: ', savedConnection.get('circles'))
      savedConnection.add('circles', circle)
      return savedConnection.save(null, { useMasterKey: true })
    })
    .then((savedConnection) => {
      updatedConnection = savedConnection
      console.log('updatedConnection', updatedConnection.get('circles'))
      console.log('shareAdditionalCircleToConnection saved connection: ', invConnection.get('fromPerson'), invConnection.get('fromPerson').id)
      const query = new Parse.Query(Parse.User)
      query.equalTo('objectId', invConnection.get('fromPerson').id)
      return query.first({ useMasterKey: true })
    })
    .then((thisUser) => {
      thisUser.set('newConnectionsFlag', true)
      return thisUser.save(null, { useMasterKey: true })
    })
    .then(() => {
      console.log('response.success(updatedConnection)', updatedConnection)
      return response.success(updatedConnection)
    })
    .catch((error) => {
      response.error(error)
    })
})

/** PRL
 * @function removeCardFromConnection
 * @description [usage MOBILE] Share a specific circle from a user, given a connection shared with him
 * This implies a unique circle per connection - it can/should be changed later
 * *** Changed/updated by PRL after updating to multiple circles
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.inverseConnectionId - connection shared with the user
 * @param {string} params.circleId - Circleid to be shared
 * @todo
 */
Parse.Cloud.define('removeCardFromConnection', function (request, response) {
  const inverseConnectionId = request.params.inverseConnectionId
  const circleId = request.params.circleId
  // const sharedCircles = request.params.sharedCircles
  // console.log('removeCircleFromConnection cloud code: ', inverseConnectionId, circleId, sharedCircles)

  let circle
  let invConnection, updatedConnection
  var queryCircle = new Parse.Query(Circle)
  var queryInvConn = new Parse.Query('Connection')

  queryCircle.get(circleId, { useMasterKey: true })
    .then((thisCircle) => {
      circle = thisCircle
      console.log('removeCircleFromConnection cloud code 0', circle)
      return queryInvConn.get(inverseConnectionId, { useMasterKey: true })
    })
    .then((foundInvConnection) => {
      invConnection = foundInvConnection
    })
    .then(() => {
      console.log('removeCircleFromConnection cloud code 1 InvConnection: ', invConnection)
      var query = new Parse.Query('Connection')
      query.include('circles')
      query.equalTo('toPerson', invConnection.get('fromPerson'))
      query.equalTo('fromPerson', invConnection.get('toPerson'))
      return query.first({ useMasterKey: true })
    })
    .then((foundConnection) => {
      const connection = foundConnection
      console.log('removeCircleFromConnection foundConnection: ', connection)
      connection.get('circles')
      return connection.save(null, { useMasterKey: true })
    })
    .then((savedConnection) => {
      // console.log('removeCircleFromConnection saved connection before: ', savedConnection.get('circles'))

      savedConnection.remove('circles', circle)
      // console.log('removeCircleFromConnection saved connection after: ', savedConnection.get('circles'))
      return savedConnection.save(null, { useMasterKey: true })
    })
    .then((savedConnection) => {
      updatedConnection = savedConnection
      // console.log('removeCircleFromConnection saved connection: ', invConnection.get('fromPerson'), invConnection.get('fromPerson').id)
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
 * @function getCirclesWithConnections
 * @description [usage MOBILE] get Circles and corresponding Connections for a
 *  user (no params used, based on the user in user session)
 * @kind Cloud Function
 * @todo
 */
Parse.Cloud.define('getCirclesWithConnections', function (request, response) {
  if (!request.user) {
    return response.error('must be logged in to get circles')
  }
  let allConns
  let allCircles
  const query = new Parse.Query('Circle')
  var user = request.user
  const queryConn = new Parse.Query('Connection')
  query.include('Connection')
  query.include('properties')
  queryConn.include('circles')
  queryConn.equalTo('status', 'connected')

  return query.find(user.sessionOptions())
    .then((circ) => {
      allCircles = circ.sort(function (a, b) {
        return a.id - b.id
      })
      return queryConn.find(user.sessionOptions())
        .then((conns) => {
          allConns = conns
        })
    })
    .then(() => {
      console.log('getCirclesWithConnections circles: ', allCircles)
      const connections = {}
      allCircles.forEach((circle) => {
        connections[circle.id] = []
        Object.entries(allConns).forEach((conn) => {
          console.log('XXX THIS conn', conn)
          const ids = conn[1].get('circles').map((c) => { return c.id })
          if (ids.indexOf(circle.id) !== -1) {
            connections[circle.id].push(conn[1])
          }
        })
      })
      console.log('XXX CONNECTIONS ', connections)
      response.success({ circles: allCircles, connections: connections })
    })
    .catch((error) => {
      return response.error(error)
    })
})

/**
 * @function getOnlyCircles
 * @description [usage MOBILE] get only Circles for a
 *  user (no params used, based on the user in user session)
 * @kind Cloud Function
 * @todo
 */
Parse.Cloud.define('getOnlyCircles', function (request, response) {
  if (!request.user) {
    return response.error('must be logged in to get circles')
  }
  let allCircles
  const query = new Parse.Query('Circle')
  var user = request.user

  return query.find(user.sessionOptions())
    .then((circ) => {
      allCircles = circ.sort(function (a, b) {
        return a.id - b.id
      })
      return allCircles
    })
    .then(() => {
      console.log('getOnlyCircles circles: ', allCircles)
      response.success({ circles: allCircles })
    })
    .catch((error) => {
      return response.error(error)
    })
})

/**
 * @function addRemovePropertyToCircle
 * @description [usage MOBILE] Add or remove a property from circle - if existent
 * @description [usage WEB] same as mobile
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.circleId - circle Id to which to add
 * @param {string} params.propId - circleproperty Id to add
 * @param {string} params.add - if add is true, add the property, else remove
 * @todo
 */
Parse.Cloud.define('addRemovePropertyToCircle', function (request, response) {
  var circleId = request.params.circleId
  var propId = request.params.propId
  console.log('addRemovePropertyToCircle START ', circleId, propId)
  var property
  var add = request.params.add
  var query = new Parse.Query('Circle')
  var queryProperties = new Parse.Query('Property')
  queryProperties.equalTo('objectId', propId)
  queryProperties.first({ useMasterKey: true })
    .then((prop) => {
      console.log('XXXX addRemovePropertyToCircle prop', prop)
      property = prop
      return query
        .include('properties')
        .equalTo('objectId', circleId)
        .first({ useMasterKey: true })
    })
    .then((circle) => {
      console.log('XXXX addRemovePropertyToCircle got first circle', circle, add, property)
      if (add) {
        circle.add('properties', property)
        console.log('XXXX addRemovePropertyToCircle ADDING', circle.get('properties'))
      } else {
        circle.remove('properties', property)
        if (circle.get('properties').length === 0) {
          throw new Parse.Error(142, 'You can\'t delete last circle property')
        }
        console.log('XXXX addRemovePropertyToCircle REMOVING', circle.get('properties'), property)
      }
      return circle.save(null, { useMasterKey: true })
    })
    .then((circle) => {
      console.log('START activateFlagForUsersinCircle: ', circle)
      const Conquery = new Parse.Query('Connection')
      Conquery.equalTo('circles', circle)
      return Conquery.find({ useMasterKey: true })
    })
    .then((connections) => {
      console.log('START activateFlagForUsersinCircle: 0', connections)
      return connections.forEach((connection) => {
        if (connection.get('toPerson')) {
          const userId = connection.get('toPerson').id
          const Uquery = new Parse.Query(Parse.User)
          Uquery.equalTo('objectId', userId)
          Uquery.first({ useMasterKey: true })
            .then((thisUser) => {
              console.log('START activateFlagForUsersinCircle: 2', thisUser)
              thisUser.set('newConnectionsFlag', true)
              thisUser.save(null, { useMasterKey: true })
            })
        }
      })
    })
    .then(() => {
      var query = new Parse.Query('Circle')
      return query
        .include('properties')
        .equalTo('objectId', circleId)
        .find({ useMasterKey: true })
    })
    .then((allCircles) => {
      allCircles.sort(function (a, b) {
        return a.id - b.id
      })
      console.log('XXXX addRemovePropertyToCircle final', allCircles)
      response.success({ circles: allCircles })
    })
    .catch((error) => {
      console.log('XXXX addRemovePropertyToCircle ERR', error)
      return response.error(error)
    })
})

module.exports = Circle
