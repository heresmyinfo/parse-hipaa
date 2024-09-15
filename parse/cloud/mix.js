var Mixpanel = require('./modules/mixpanel.js')
var mixpanelToken = 'b3723b7d4328b967d2dcb25f8fb87b1a'
var mixpanel = Mixpanel.init(mixpanelToken)

/**
 * @function track
 * @description mixpanel tracking utility routine
 */
exports.track = function (eventname, distinctId) {
  var properties = {
    'distinct_id': distinctId,
    'production': false,
    'date': new Date()
  }
  mixpanel.track(eventname, properties).then(function () {
    console.log('event ' + eventname + ' was tracked')
  }, function (error) {
    console.log(error)
  })
}

/**
 * @function people
 * @description mixpanel people set
 */
exports.people = function (properties, distinctId) {
  mixpanel.people.set(distinctId, properties)
    .then(() => {
      console.log('person properties were set')
    }, function (error) {
      console.log(error)
    })
}
