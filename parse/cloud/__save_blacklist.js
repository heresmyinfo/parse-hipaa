// /* global Parse */

// /*
//  They will be "getBlacklist", which will return an array of QBlacklist
//  which will be a PFObject subclass with at least the property of "name",

//  "addToBlacklist" will take a string messageId, which will add that person to the blacklist
//  and return the newly added QBlacklist object

//  "removeFromBlacklist" which will take a string blacklistId
//  which is the objectId from a QBlacklist object
//  and it will return YES if successful, and an error if not
//  */

// // not used yet by either WEB or MOBILE
// var _ = require('underscore')
// var Blacklist = Parse.Object.extend('Blacklist', {

//   // instance methods
//   // methodName: function(args){},
// }, {
//   // class methods
//   // methodName: function(args){},

//   blockEachother: function (id1, id2) {
//     var right = new Parse.Query('Blacklist')
//     right.equalTo('profileId', id1).equalTo('blockingProfileId', id2)

//     var left = new Parse.Query('Blacklist')
//     left.equalTo('profileId', id2).equalTo('blockingProfileId', id1)

//     var either = Parse.Query.or(left, right)

//     return either.count({ useMasterKey: true }).then(function (number) {
//       if (number > 0) {
//         return Parse.Promise.as(true)
//       } else {
//         return Parse.Promise.as(false)
//       }
//     }, function (error) {
//       console.error(error)
//       return Parse.Promise.as(false)
//     })
//   },

//   addToBlacklist: function (user, messageId) {
//     // get the Message, get the fromPerson's Id
//     // check to see if we already have that in our messages
//     // return the message object if so
//     // otherwise create the new blacklist and return it after deleting the message

//     var returnError = function (error) {
//       return Parse.Promise.error(error)
//     }

//     var query = new Parse.Query('Message')
//     query.include('fromPerson.profile.objectId')

//     //		Parse.Cloud.useMasterKey();

//     return query.get(messageId, { useMasterKey: true }).then(function (message) {
//       var savedMessage = message
//       var idToBlock = message.get('fromPerson').get('profile').id

//       savedMessage.destroy(user.sessionOptions())

//       var blacklistQuery = new Parse.Query('Blacklist')
//       blacklistQuery.equalTo('profileId', idToBlock)

//       return blacklistQuery.first().then(function (blacklist) {
//         if (blacklist) {
//           return Parse.Promise.as(blacklist)
//         } else {
//           // create a new blacklist
//           var newBL = new Blacklist()
//           newBL.setACL(new Parse.ACL(user))
//           newBL.set('profileId', idToBlock)
//           newBL.set('blockingProfileId', Parse.User.current().get('profile').id)
//           newBL.set('name', message.get('fromName'))

//           return newBL.save()
//         }
//       }, returnError)
//     }, returnError)
//   },

//   removeFromBlacklist: function (user, blacklistId) {
//     var query = new Parse.Query('Blacklist')
//     return query.get(blacklistId).then(function (blacklist) {
//       if (!blacklist) {
//         return Parse.Promise.as('YES')
//       }

//       return blacklist.destroy(user.sessionOptions()).then(function (something) {
//         return Parse.Promise.as('YES')
//       })
//     })
//   }

// })

// Parse.Cloud.define('getBlacklist', function (request, response) {
//   if (!request.user) {
//     response.error('must be logged in to get blacklist')
//     return
//   }

//   var getBlacklist = new Parse.Query('Blacklist')
//   return getBlacklist.find().then(function (blacklist) {
//     if (_.isArray(blacklist)) {
//       response.success(blacklist)
//     } else {
//       response.success([blacklist])
//     }
//   }, function (error) {
//     response.error(error)
//   })
// })

// Parse.Cloud.define('addToBlacklist', function (request, response) {
//   if (!request.user) {
//     response.error('must be logged in to add to blacklist')
//     return
//   }

//   var messageId = request.params.messageId

//   if (!messageId) {
//     response.error('must specify which message to block the sender of')
//     return
//   }

//   Blacklist.addToBlacklist(request.user, messageId).then(function (blacklist) {
//     response.success(blacklist)
//   }, function (error) {
//     response.error(error)
//   })
// })

// Parse.Cloud.define('removeFromBlacklist', function (request, response) {
//   if (!request.user) {
//     response.error('must be logged in to add to blacklist')
//     return
//   }

//   var blacklistId = request.params.blacklistId

//   if (!blacklistId) {
//     response.error('must specify which blacklist to remove')
//     return
//   }

//   Blacklist.removeFromBlacklist(request.user, blacklistId).then(function (success) {
//     response.success(success)
//   }, function (error) {
//     response.error(error)
//   })
// })

// module.exports = Blacklist
