// class Whitelist extends Parse.Object {

//     constructor() {
//         super('Whitelist');
//     }
// }

// Parse.Object.registerSubclass('Whitelist', Whitelist);

// Parse.Cloud.define('addToWhitelist', function (request, response) {
//     if (!request.params.email) {
//         return response.error('missing email for whitelist');
//     }

//     var email = request.params.email;

//     var whitelist = new Whitelist();
//     whitelist.set('email', email);
//     whitelist.save(null, { 
//         useMasterKey: true,
//         success: function(whitelist) {
//             return response.success('Email ' + email + ' was added to whitelist successfully!');
//         }, 
//         error: function(whitelist, error) {
//             return response.error('Could not add email ' + email + ' to whitelist: ' + error);
//         }
//     });
// });

// Parse.Cloud.define('removeFromWhitelist', function (request, response) {
//     if (!request.params.email) {
//         return response.error('missing email for removal from whitelist');
//     }

//     var email = request.params.email;
//     var query = new Parse.Query(Whitelist);
//     query.equalTo('email', email);
//     query.find({useMasterKey: true}).then(
//         function(results) {
//             var promises = [];
//             _.each(results, function (emailToDelete) {
//                 promises.push(emailToDelete.destroy({useMasterKey:true})); 
//             });
//             return Parse.Promise.when(promises);
//         }
//     ).then(
//         function(results) {
//             return response.success('Email ' + email + ' was removed from whitelist successfully!');
//         },
//         function(error) {
//             return response.error('Could not remove email ' + email + ' from whitelist: ' + error);
//         }
//     );
// });

// Parse.Cloud.define('showWhitelist', function (request, response) {
//     var query = new Parse.Query(Whitelist);
//     query.find({
//         useMasterKey: true,
//         success: function(results) {
//             var emails = results.map(function(result) { return result.get('email'); } );
//             return response.success(emails);
//         },
//         error: function(error) {
//             return response.error('Could not remove email ' + email + ' from whitelist: ' + error);
//         }});
// });

// module.exports = Whitelist;

// var _ = require('underscore');
// var mp = require('./mix.js');
