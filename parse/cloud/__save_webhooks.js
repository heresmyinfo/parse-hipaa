// exports.build = function () {
//     var hookNames = [
//         "createCardDAV",
//         "getCard",
//         "deleteCard",
//         "phoneNumberFormatter",
//         "convertCard",
//         "addCard",
//         "deleteCardDAV",
//         "getCards",
//         "updateCard",
//         "updateCards"];

//     Parse.Hooks.getFunctions().then(function (funcs) {
//         var promises = [];
//         var existingHooks = funcs.map(function (f) {
//             return f.functionName;
//         });

//         existingHooks.forEach(function (existingHook) {
//             if (!hookNames.includes(existingHook)) {
//                 console.log("Removing webhook " + existingHook);
//                 promises.push(Parse.Hooks.removeFunction(existingHook));
//             }
//         });

//         hookNames.forEach(function (hookName) {
//             if (existingHooks.includes(hookName)) {
//                 console.log("Updating webhook " + hookName);
//                 promises.push(Parse.Hooks.updateFunction(hookName, process.env.CARDDAV_URL));
//             } else {
//                 console.log("Creating webhook " + hookName);
//                 promises.push(Parse.Hooks.createFunction(hookName, process.env.CARDDAV_URL));
//             }
//         });

//         return Promise.all(promises);
//     }).then(function (t) {
//         return Parse.Hooks.getFunctions();
//     }).then(function (funcs) {
//         console.log("Webhooks:");
//         console.log(funcs);
//     });
// }
