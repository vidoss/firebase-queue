var QueueWorker = require('./lib/queue_worker'),
    Firebase = require('firebase');

/**
 * @constructor
 * @param {String} referenceUrl The URL to the Firebase queue.
 * @param {String} token A JWT with the uid set to the current job ID.
 * @param {Integer} numWorkers The number of workers to create for this job.
 * @param {Function} processingFunction A function that is called each time to
 *   process the queue item. This function is passed three parameters:
 *     - data {Object} The current data at the location.
 *     - resolve {Function} An asychronous callback function - call this
 *         function when the processingFunction completes successfully. This
 *         takes an optional Object parameter that, if passed, will overwrite
 *         the data at the queue item location
 *     - reject {Function} An asynchronous callback function - call this
 *         function if the processingFunction encounters an error. This takes
 *         an optional String or Object parameter that will be stored in the
 *         '_error_details/error' location in the queue item.
 */
module.exports = Queue;

function Queue(referenceUrl, token, numWorkers, processingFunction) {
  var self = this;
  if (typeof(numWorkers) !== 'number' ||
        numWorkers % 1 !== 0 ||
        numWorkers <= 0) {
    throw new Error('The number of workers must be a possitive integer');
  }
  self.ref = new Firebase(referenceUrl, new Firebase.Context());
  self.workers = [];
  self.ref.authWithCustomToken(token, function(error, authData) {
    if (error) {
      throw error;
    }
    for (var i = 0; i < numWorkers; i++) {
      self.workers.push(QueueWorker(self.ref, i, processingFunction));
    }

    self.ref.parent().child('_jobs').child(self.jobId).on('value',
      function(jobSpecSnap) {
        if (jobSpecSnap.val() === null) {
          throw new Error('No job specified for this worker');
        }
        if (jobSpecSnap.child('state').val() === null) {
          throw new Error('No state specified for this job');
        }

        var jobSpec = {
          startState: jobSpecSnap.child('state/start').val(),
          inProgressState: jobSpecSnap.child('state/inProgress').val(),
          finishedState: jobSpecSnap.child('state/finished').val(),
          jobTimeout: jobSpecSnap.child('timeout').val()
        };

        if (!jobSpec.inProgressState) {
          throw new Error('No inProgress state specified for this job');
        }
        if (!jobSpec.finishedState) {
          throw new Error('No finished state specified for this job');
        }

        for (var i = 0; i < numWorkers; i++) {
          self.workers[i].resetJob(jobSpec);
        }
      },
      function(error) {
        throw error;
      });
  });
  return self;
}
