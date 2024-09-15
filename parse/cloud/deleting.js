/* global Parse */

var Connection = require('./connection.js')
var Message = require('./message')
const isAdminOrFail = require('./administration').isAdminOrFail

/**
 * @function deleteUsers
 * @description [usage WEB] deleting users from the admin page
 * @kind Cloud Function
 * @param array users - ids of users to delete
 */
Parse.Cloud.define('deleteUsers', async (request, response) => {
  try {
    if (!isAdminOrFail(request, response)) {
      return null
    }

    const users = request.params.users
    if (!users || !users.length) {
      return response.error('Select users to delete')
    }

    const errors = []

    for (let userId of users) {
      // Find user
      let query = new Parse.Query(Parse.User)
      query.include('profile')
      let user
      try {
        user = await query.get(userId, { useMasterKey: true })
      } catch (error) {
        errors.push(`User with id ${userId} was not found`)
        continue
      }
      const businesses = user.get('businesses')
      if (businesses && businesses.length > 0) {
        errors.push(`You can not delete user with id ${user.id} because he has a business`)
        continue
      }
      let promises = []

      // Delete connections
      let fromPersonQuery = new Parse.Query(Connection)
      fromPersonQuery.equalTo('fromPerson', user)
      let toPersonQuery = new Parse.Query(Connection)
      toPersonQuery.equalTo('toPerson', user)
      query = Parse.Query.or(fromPersonQuery, toPersonQuery)
      let connections = await query.find({ useMasterKey: true })
      promises.push(Parse.Object.destroyAll(connections, { useMasterKey: true }))

      // Delete messages
      fromPersonQuery = new Parse.Query(Message)
      fromPersonQuery.equalTo('fromPerson', user)
      toPersonQuery = new Parse.Query(Message)
      toPersonQuery.equalTo('toPerson', user)
      query = Parse.Query.or(fromPersonQuery, toPersonQuery)
      let messages = await query.find({ useMasterKey: true })
      promises.push(Parse.Object.destroyAll(messages, { useMasterKey: true }))

      // Delete circles, properties and profile
      let profile = user.get('profile')
      if (profile) {
        promises.push(Parse.Object.destroyAll(profile.get('circles'), { useMasterKey: true }).catch(() => {}))
        promises.push(Parse.Object.destroyAll(profile.get('properties'), { useMasterKey: true }).catch(() => {}))
        promises.push(profile.destroy({ useMasterKey: true }))
      }

      // Delete QRCodes
      const qrQuery = new Parse.Query('QRCode')
      qrQuery.equalTo('user', user)
      const qrCodes = await qrQuery.find({ useMasterKey: true })
      promises.push(Parse.Object.destroyAll(qrCodes, { useMasterKey: true }))

      // Delete sessions
      let sessionsQuery = new Parse.Query(Parse.Session)
      sessionsQuery.equalTo('user', user)
      let sessions = await sessionsQuery.find({ useMasterKey: true })
      promises.push(Parse.Object.destroyAll(sessions, { useMasterKey: true }))

      // Delete Social login links
      const slQuery = new Parse.Query('SocialLogin')
      qrQuery.equalTo('user', user)
      const socialLogins = await slQuery.find({ useMasterKey: true })
      promises.push(Parse.Object.destroyAll(socialLogins, { useMasterKey: true }))

      // Delete User
      promises.push(user.destroy({ useMasterKey: true }))

      await Promise.all(promises)
    }
    if (errors.length > 0) {
      return response.error(errors.join('\n'))
    }
    return response.success({ })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function deleteConnections
 * @description [usage WEB] deleting connections from the admin page
 * @kind Cloud Function
 * @param array connections - ids of connections to delete
 */
Parse.Cloud.define('deleteConnections', async (request, response) => {
  try {
    if (!isAdminOrFail(request, response)) {
      return null
    }
    const connectionIds = request.params.connections
    if (!connectionIds || !connectionIds.length) {
      return response.error('Select connections to delete')
    }

    const query = new Parse.Query(Connection)
    query.containedIn('objectId', connectionIds)
    query.include('inverseConnection')
    const connections = await query.find({ useMasterKey: true })
    const inverseConnections = []
    const messages = []
    if (connections.length) {
      for (let connection of connections) {
        if (connection.get('messages')) {
          const msg = await connection.get('messages').query().find({ useMasterKey: true })
          msg.forEach(message => {
            if (!messages.find(m => m.id === message.id)) {
              messages.push(message)
            }
          })
        }
        if (connection.get('inverseConnection')) {
          const inverse = connection.get('inverseConnection')
          inverseConnections.push(inverse)
          if (inverse.get('messages')) {
            const msg = await inverse.get('messages').query().find({ useMasterKey: true })
            msg.forEach(message => {
              if (!messages.find(m => m.id === message.id)) {
                messages.push(message)
              }
            })
          }
        }
      }
      if (messages.length > 0) {
        await Parse.Object.destroyAll(messages, { useMasterKey: true })
      }
      await Parse.Object.destroyAll(connections, { useMasterKey: true })
      if (inverseConnections.length > 0) {
        await Parse.Object.destroyAll(inverseConnections, { useMasterKey: true })
      }
    }
    return response.success({ })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function deleteBusinesses
 * @description [usage WEB] deleting businesses from the admin page
 * @kind Cloud Function
 * @param array businesses - ids of businesses to delete
 */
Parse.Cloud.define('deleteBusinesses', async (request, response) => {
  try {
    if (!isAdminOrFail(request, response)) {
      return null
    }

    const businesses = request.params.businesses
    if (!businesses || !businesses.length) {
      return response.error('Select businesses to delete')
    }

    for (let businessId of businesses) {
      // Find business
      let query = new Parse.Query('Business')
      query.include('profile')
      let business
      try {
        business = await query.get(businessId, { useMasterKey: true })
      } catch (error) {
        continue
      }
      const promises = []

      // Update the owner
      try {
        const owner = await business.getOwner()
        owner.remove('businesses', business)
        promises.push(owner.save(null, { useMasterKey: true }))
      } catch (err) {
      }

      // Delete circles and properties
      promises.push(Parse.Object.destroyAll(business.get('circles'), { useMasterKey: true }).catch(() => {}))
      promises.push(Parse.Object.destroyAll(business.get('properties'), { useMasterKey: true }).catch(() => {}))
      promises.push(business.destroy({ useMasterKey: true }))

      await Promise.all(promises)
    }
    return response.success({ })
  } catch (error) {
    return response.error(error)
  }
})
