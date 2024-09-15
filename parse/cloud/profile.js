/* global Parse */

var _ = require('underscore')
var mp = require('./mix.js')
const Property = require('./property.js')
const QRCode = require('./qrcode.js')
const Circle = require('./circle.js')

class Profile extends Parse.Object {
  constructor () {
    super('Profile')
  }

  createEmptyCircle (user, circleName, circleOrder) {
    console.log('running createEmptyCircle')
    var promise = new Parse.Promise()
    var defaultProperties = []
    var allProperties = this.get('properties')
    Property.fetchAll(allProperties, user.sessionOptions()).then(function (properties) {
      _.each(properties, function (property) {
        if (property.isNamePart() || property.isHMISocialProfile()) {
          defaultProperties.push(property)
        }
      })
      var circle = Circle.newCircleWithProperties(user, circleName, defaultProperties, circleOrder)
      return circle.save(null, { useMasterKey: true })
    }).then(function (circle) {
      promise.resolve(circle)
    }, function (error) {
      promise.reject(error)
    })
    return promise
  }

  static rehydrate (user, profile) {
    var promise = new Parse.Promise()
    profile.fetch({ sessionToken: user.getSessionToken() })
      .then(
        function (profile) {
          var properties = profile.get('properties')
          return Property.fetchAll(properties, { sessionToken: user.getSessionToken() })
        }
      ).then(
        function (props) {
          return promise.resolve(profile)
        },
        function (error) {
          console.log('error hydrating profile ' + JSON.stringify(error))
          promise.reject(error)
        }
      )
    return promise
  }

  // class methods
  static async createNewProfile (
    user, givenName, familyName, delimiter,
    email, phone, countryCode, workEmail, workPhone
  ) {
    let profile = new Profile()
    profile.setACL(new Parse.ACL(user))
    profile.set('name', `${givenName} ${familyName}`)
    profile.set('delimiter', delimiter)
    if (countryCode) {
      profile.set('countryCode', countryCode)
    }
    // Step 1 - create properties; if something goes wrong, properties would cleanup internally
    const properties = await Property.buildInitialProperties(user, givenName, familyName, delimiter, email, phone, countryCode, workEmail, workPhone)
    properties.forEach(property => profile.addUnique('properties', property))

    try {
      // Step 2 - save profile with properties; cleanup properties in case of failure
      await profile.save(null, { useMasterKey: true })

      try {
        // Step 3 - create circles; cleanup profile (and properties) in case of failure
        profile = await Profile.rehydrate(user, profile)
        const circles = await Profile.createDefaultCircles(user, profile.get('properties'))

        try {
          // Step 4 - save circles to profile; cleanup all in case of failure
          circles.forEach(circle => {
            if (circle.get('defaultCircle')) {
              profile.set('defaultCircle', circle)
              profile.addUnique('sharedCircles', circle)
            }
            profile.addUnique('circles', circle)
          })

          // Create default QRCode
          await QRCode.createDefault(user, profile.get('defaultCircle'))

          // Result operation is here
          profile = await profile.save(null, { useMasterKey: true })
        } catch (error) {
          // Catch Step 4, cleanup circles and throw further
          circles.forEach(circle => {
            circle.destroy({ useMasterKey: true })
          })
          throw error
        }
      } catch (error) {
        // Catch Step 3 and nested, cleanup profile and throw further
        await profile.destroy({ useMasterKey: true })
        throw error
      }
    } catch (error) {
      // Catch Step 2 and nested, cleanup properties
      const promises = []
      properties.forEach(property => promises.push(property.destroy({ useMasterKey: true })))
      await Promise.all(promises)
      throw error
    }

    return profile
  }

  /**
   * Create default circles: Work, Personal, Public
   * Public circle contains only given and family name
   * Work and Personal circles are private by default
   * @param {Parse.User} user
   * @param {Property[]} properties
   */
  static createDefaultCircles (user, properties) {
    const promise = new Parse.Promise()
    const homeCircleProperties = []
    const workCircleProperties = []
    const publicCircleProperties = []
    const saveCircles = []

    properties.forEach(property => {
      // Add email to work and personal circles
      if (property.get('name') === 'emailAddresses') {
        homeCircleProperties.push(property)
        workCircleProperties.push(property)
      }
      // Add phone number only to personal circle
      if (property.get('name') === 'phoneNumbers') {
        homeCircleProperties.push(property)
      }
      // Add given and family name to all circles
      if (['givenName', 'familyName'].includes(property.get('name'))) {
        homeCircleProperties.push(property)
        workCircleProperties.push(property)
        publicCircleProperties.push(property)
      }
    })

    const defaultWorkCircle = Circle.newCircleWithProperties(user, 'Work', workCircleProperties)
    defaultWorkCircle.set('defaultCircle', true)
    defaultWorkCircle.set('public', false)
    saveCircles.push(defaultWorkCircle)

    const personalCircle = Circle.newCircleWithProperties(user, 'Personal', homeCircleProperties)
    personalCircle.set('public', false)
    saveCircles.push(personalCircle)

    // @todo Disabling Public circle for new users, uncomment next 3 lines to return it
    // const publicCircle = Circle.newCircleWithProperties(user, 'Public', publicCircleProperties)
    // publicCircle.set('public', true)
    // saveCircles.push(publicCircle)

    saveCircles.forEach(function (curCircle, index) {
      curCircle.set('order', index)
    })

    Parse.Object.saveAll(saveCircles, { useMasterKey: true }).then(
      function () {
        user.set('QRcircleId', defaultWorkCircle)
        user.save(null, { useMasterKey: true })
        promise.resolve(saveCircles)
      },
      function (error) {
        promise.reject(error)
      }
    )
    return promise
  }
}

Parse.Object.registerSubclass('Profile', Profile)

/**
 * @function createProfile
 * @description [usage MOBILE] create a profile from a set of params
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.givenName
 * @param {string} params.familyName
 * @param {string} params.delimiter
 * @param {string} params.email
 * @param {string} params.workEmail
 * @param {string} params.workPhone
 * @param {string} params.phone
 * @param {string} params.countryCode
 * @todo Add this directly to signup page and remove it from client signup procedure
 */
Parse.Cloud.define('createProfile', function (request, response) {
  if (!request.user) {
    response.error('Must be signed up and logged in to call createProfile.')
    return
  }
  const user = request.user
  const givenName = request.params.givenName
  const familyName = request.params.familyName
  const delimiter = request.params.delimiter
  const email = request.params.email
  const workEmail = request.params.workEmail
  const workPhone = request.params.workPhone
  const phone = request.params.phone
  const countryCode = request.params.countryCode
  let profile

  if (!givenName || !familyName || !email) {
    response.error('Must have at minimum an email, givenName, familyName. ', request.params)
  } else {
    if (phone && !countryCode) {
      response.error('Must have countryCode when phone is provided to create a Profile.')
    } else {
      mp.track('createProfile', user.id)
      Profile.createNewProfile(user, givenName, familyName, delimiter, email, phone, countryCode, workEmail, workPhone).then(
        function (newProfile) {
          profile = newProfile
          user.set('profile', profile)
          return user.save(null, { useMasterKey: true })
        }
      ).then(
        function (user) {
          response.success(profile)
        },
        function (error) {
          response.error(error)
        })
    }
  }
})

/**
 * @function getProfile
 * @description [usage MOBILE] [usage WEB] get profile from the user in user session
 * @kind Cloud Function
 * @param {object} params
 * @todo
 */
Parse.Cloud.define('getProfile', function (request, response) {
  var user = request.user

  console.log('getProfile user', user)
  var query = new Parse.Query('Profile')
  query.include('properties').first(user.sessionOptions())
    .then((profile) => {
      console.log('getProfile success', profile)
      response.success(profile)
    })
    .catch((error) => {
      response.error(error)
    })
})

/**
 * @function addBasicPropsToProfile
 * @description [usage MOBILE] Add First User phone to Profile after email is validated
 *  resulting from mobile app sequence to create initially the profile with email,
 *  and just then ask for phone;
 * @description [usage WEB] Same scenario, as mobile
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.phone - phone
 * @todo
 */
Parse.Cloud.define('addBasicPropsToProfile', function (request, response) {
  console.log('addBasicPropsToProfile START', request.params, request.user)
  let myPropPhone, profile
  let myFinalProfile, thisUser
  const Uquery = new Parse.Query(Parse.User)
  Uquery.get(request.user, { useMasterKey: true })
  Uquery.include('profile')
  Uquery.include('profile.properties')
  Uquery.include('profile.circles')
  Uquery.first({ useMasterKey: true })
    .then((user) => {
      thisUser = user
      profile = user.get('profile')
      console.log('addBasicPropsToProfile user', request.params, user, profile)
      return Property.getPropertyByParameterValue(request.params.phone, 'phoneNumbers', false, request.user)
    })
    .then((exist) => {
      console.log('addBasicPropsToProfile exist? ', exist)
      if (!exist) {
        return Property.newPhoneProperty(thisUser, request.params.phone, 'personal & work', request.params.countryCode)
      } else {
        return exist
      }
    })
    .then((propPhone) => {
      myPropPhone = propPhone
      profile.addUnique('properties', myPropPhone)
      thisUser.set('phone', myPropPhone.get('parameters')[1].value)
      thisUser.set('E164', myPropPhone.get('parameters')[1].value)
      thisUser.save(null, { useMasterKey: true })
      return profile.save(null, { useMasterKey: true })
    })
    .then((profile) => {
      myFinalProfile = profile
      const allCircles = myFinalProfile.get('circles')
      return allCircles.forEach((circle) => {
        // Add phone number only to personal circle
        if (circle.get('name') === 'Personal') {
          Parse.Cloud.run('addRemovePropertyToCircle', { circleId: circle.id, propId: myPropPhone.id, add: true })
        }
      })
    })
    .then(() => {
      response.success(myFinalProfile)
    })
    .catch((error) => {
      console.log('addBasicPropsToProfile error ', error)
      response.error(error)
    })
})

module.exports = Profile
