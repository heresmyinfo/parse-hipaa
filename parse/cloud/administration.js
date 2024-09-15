const Connection = require('./connection.js')
const QRCode = require('./qrcode')

function isAdminOrFail (request, response) {
  // Allow access with master key
  if (request.master === true) {
    return true
  }
  if (!request.user) {
    response.error(403, 'Not allowed')
    return false
  }
  if (!request.user.get('isAdmin')) {
    response.error(403, 'Not allowed')
    return false
  }
  return true
}

/**
 * @function getUsersWithProperties
 * @description [usage WEB] - used on admin page - get all users for current page with their properties
 * @kind Cloud Function
 * @param {int} perPage - number of users per page
 * @param {int} page - current page (starts from 0)
 * @param {string} search - optional search query
 */
Parse.Cloud.define('getUsersWithProperties', async (request, response) => {
  try {
    if (!isAdminOrFail(request, response)) {
      return null
    }
    const perPage = Math.min(50, parseInt(request.params.perPage) || 5)
    const page = parseInt(request.params.page) || 0 // from 0
    const searchTerm = (request.params.search || '').trim()
    let mainQuery

    if (searchTerm.length >= 3) {
      const orQueries = []
      // Search by properties (email, phone, name, etc)
      const propertyQuery1 = new Parse.Query('Property')
      propertyQuery1.equalTo('parameters.1.value', searchTerm.replace('\'', '\'\''))
      orQueries.push(propertyQuery1)

      const propertyQuery2 = new Parse.Query('Property')
      propertyQuery2.startsWith('value', searchTerm)
      orQueries.push(propertyQuery2)

      // Try to search for capitalize name
      const searchTermCapitalized = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1)
      if (searchTermCapitalized !== searchTerm) {
        const propertyQuery3 = new Parse.Query('Property')
        propertyQuery3.startsWith('value', searchTermCapitalized)
        orQueries.push(propertyQuery3)
      }

      const propertyQuery = Parse.Query.or(...orQueries)
      const profileQuery = new Parse.Query('Profile')
      profileQuery.matchesQuery('properties', propertyQuery)

      const searchByProperties = new Parse.Query(Parse.User)
      searchByProperties.matchesQuery('profile', profileQuery)

      // Search by User Id
      const searchById = new Parse.Query(Parse.User)
      searchById.startsWith('objectId', searchTerm)

      mainQuery = Parse.Query.or(searchByProperties, searchById)
    } else {
      mainQuery = new Parse.Query(Parse.User)
    }
    const total = await mainQuery.count({ useMasterKey: true })

    mainQuery.include('profile')
    mainQuery.include('profile.properties')
    mainQuery.limit(perPage)
    mainQuery.skip(perPage * (page))
    mainQuery.descending('createdAt')
    const users = await mainQuery.find({ useMasterKey: true })

    return response.success({ users, total })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function getUserWithProperties
 * @description [usage WEB] - used on admin page - get one user with properties
 * @kind Cloud Function
 * @param string user - id of the user
 */
Parse.Cloud.define('getUserWithProperties', async (request, response) => {
  try {
    // if (!isAdminOrFail(request, response)) {
    //   return null
    // }
    const userId = request.params.user
    const query = new Parse.Query(Parse.User)
    query.include('profile')
    query.include('profile.properties')

    const user = await query.get(userId, { useMasterKey: true })
    return response.success({ user })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function getConnectionsForUsers
 * @description [usage WEB] - get connections of given users, admin page
 * @kind Cloud Function
 * @param {array} users - ids of users
 * @param {array} properties optional array of properties to read for requested users
 */
Parse.Cloud.define('getConnectionsForUsers', async (request, response) => {
  try {
    // if (!isAdminOrFail(request, response)) {
    //   return null
    // }
    const users = request.params.users
    const addProperties = request.params.properties || []

    if (!users || !users.length) {
      return response.error('Users list should not be empty')
    }
    const fromPersonQuery = new Parse.Query(Connection)
    fromPersonQuery.containedIn('fromPerson', users)
    const toPersonQuery = new Parse.Query(Connection)
    toPersonQuery.containedIn('toPerson', users)
    const query = Parse.Query.or(fromPersonQuery, toPersonQuery)
    const connections = await query.find({ useMasterKey: true })

    // Adding properties
    let properties = []
    if (addProperties.length) {
      const ids = new Set()
      for (const connection of connections) {
        ids.add(connection.get('fromPerson').id)
        if (connection.get('toPerson') && connection.get('toPerson').id) {
          ids.add(connection.get('toPerson').id)
        }
      }

      const propertyQuery = new Parse.Query('Property')
      // @todo revisit it and select only required properties for given users (try ACL query or inject sql query)
      // Unfortunatelly, Parse will use it only to filters users with given properties, but then will load all the properties
      propertyQuery.containedIn('name', addProperties)
      const profileQuery = new Parse.Query('Profile')
      profileQuery.matchesQuery('properties', propertyQuery)
      const userQuery = new Parse.Query(Parse.User)
      userQuery.containedIn('objectId', [...ids])
      userQuery.include('profile.properties')
      userQuery.select('profile.properties')
      userQuery.matchesQuery('profile', profileQuery)
      properties = await userQuery.find({ useMasterKey: true })
    }

    return response.success({ connections, properties })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function generateQRCodes
 * @description [usage WEB] - used on admin page - pre-generate banch of QR codes
 * @kind Cloud Function
 * @param string label - label to assign to QR codes (eg. Vegas Roadshow 2019)
 * @param int amount - number of codes to generate
 */
Parse.Cloud.define('generateQRCodes', async (request, response) => {
  try {
    if (!isAdminOrFail(request, response)) {
      return null
    }
    const amount = parseInt(request.params.amount || 50)
    const label = request.params.label || 'Auto generated bunch'
    const codes = []
    for (let i = 1; i <= amount; i++) {
      const newQRCode = await QRCode.createMetal(label)
      codes.push(newQRCode)
    }
    return response.success({ list: codes })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function getAllQRCodesWithoutUser
 * @description [usage Web] get list of all QR codes without user in the system.
 * @kind Cloud Function
 */
Parse.Cloud.define('getAllQRCodesWithoutUser', async function (request, response) {
  try {
    if (!isAdminOrFail(request, response)) {
      return null
    }
    const query = new Parse.Query(QRCode)
    query.doesNotExist('user')
    query.limit(10000)
    const qrCodes = await query.find({ useMasterKey: true })
    const res = []
    qrCodes.forEach(code => res.push({
      QRCode: code.get('QRCode'),
      label: code.get('label')
    }))
    return response.success(res)
  } catch (error) {
    return response.error(error)
  }
})

module.exports.isAdminOrFail = isAdminOrFail
