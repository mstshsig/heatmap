function makeInfoBox(controlDiv, map) {
  // Set CSS for the control border.
  var controlUI = document.createElement('div');
  controlUI.style.boxShadow = 'rgba(0, 0, 0, 0.298039) 0px 1px 4px -1px';
  controlUI.style.backgroundColor = '#fff';
  controlUI.style.border = '2px solid #fff';
  controlUI.style.borderRadius = '2px';
  controlUI.style.marginBottom = '22px';
  controlUI.style.marginTop = '10px';
  controlUI.style.textAlign = 'center';
  controlDiv.appendChild(controlUI);

  // Set CSS for the control interior.
  var controlText = document.createElement('div');
  controlText.style.color = 'rgb(25,25,25)';
  controlText.style.fontFamily = 'Roboto,Arial,sans-serif';
  controlText.style.fontSize = '100%';
  controlText.style.padding = '6px';
  controlText.innerText = 'The map shows every 30 second position in the last 2 hours.';
  controlUI.appendChild(controlText);
}

var map = null;

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: {lat: 0, lng: 0},
    zoom: 20,
    styles: [{
      featureType: 'poi',
      stylers: [{ visibility: 'off' }]  // Turn off points of interest.
    }, {
      featureType: 'transit.station',
      stylers: [{ visibility: 'off' }]  // Turn off bus stations, train stations, etc.
    }],
    disableDoubleClickZoom: true
  });

  // Create the DIV to hold the control and call the makeInfoBox() constructor
  // passing in this DIV.
  var infoBoxDiv = document.createElement('div');
  var infoBox = new makeInfoBox(infoBoxDiv, map);
  infoBoxDiv.index = 1;
  map.controls[google.maps.ControlPosition.TOP_CENTER].push(infoBoxDiv);

  // Create a heatmap.
  var heatmap = new google.maps.visualization.HeatmapLayer({
    data: [],
    map: map,
    radius: 16
  });

  initAuthentication(initFirebase.bind(undefined, heatmap));

  // 30秒ごとに現在地を取得
  setInterval("getCurrentPosition()",30000);
}

function getCurrentPosition() {
  // Try HTML5 geolocation.
  navigator.geolocation.getCurrentPosition(successCallback, errorCallback, optionObj);
}

/***** ユーザーの現在の位置情報を取得 *****/
function successCallback(position) {
  ++data.count;
  data.lat = position.coords.latitude;
  data.lng = position.coords.longitude;
  data.timestamp = new Date().getTime();

  if(data.count == 1) {
    var centerpos = {
      lat: data.lat,
      lng: data.lng
    };
    map.setCenter(centerpos);
  }

  addToFirebase(data);
  // var ref = firebase.database().ref('current').push(data, function(err) {
  // if (err) {  // Data was not written to firebase.
  //   console.log(err);
  // }
  // });
    
  var gl_text = "緯度：" + position.coords.latitude + "<br>";
    gl_text += "経度：" + position.coords.longitude + "<br>";
    gl_text += "高度：" + position.coords.altitude + "<br>";
    gl_text += "緯度・経度の誤差：" + position.coords.accuracy + "<br>";
    gl_text += "高度の誤差：" + position.coords.altitudeAccuracy + "<br>";
    gl_text += "方角：" + position.coords.heading + "<br>";
    gl_text += "速度：" + position.coords.speed + "<br>";
    gl_text += "回数：" + data.count + "<br>";
 document.getElementById("show_result").innerHTML = gl_text;
}

/***** 位置情報が取得できない場合 *****/
function errorCallback(error) {
  var err_msg = "";
  switch(error.code)
  {
    case 1:
      err_msg = "位置情報の利用が許可されていません";
      break;
    case 2:
      err_msg = "デバイスの位置が判定できません";
      break;
    case 3:
      err_msg = "タイムアウトしました";
      break;
  }
 document.getElementById("show_result").innerHTML = err_msg;
  //デバッグ用→　document.getElementById("show_result").innerHTML = error.message;
}

/**
 * Reference to Firebase database.
 * @const
 */
// var firebase = new Firebase('https://fir-map-1493795894961.firebaseio.com');

/**
 * Data object to be written to Firebase.
 */
var data = {
  count: 0,
  sender: null,
  timestamp: null,
  lat: null,
  lng: null
};

// オプション・オブジェクト
var optionObj = {
  "enableHighAccuracy": true ,
  "timeout": 1000000 ,
  "maximumAge": 0 ,
} ;

/**
 * Starting point for running the program. Authenticates the user.
 * @param {function} Called when authentication succeeds.
 */
function initAuthentication(onAuthSuccess) {

  firebase.auth().signInAnonymously().catch(function(error) {
    // Handle Errors here.
    var errorCode = error.code;
    var errorMessage = error.message;

    if (errorCode === 'auth/operation-not-allowed') {
      alert('You must enable Anonymous auth in the Firebase Console.');
    } else {
      console.error(error);
    }
  });

  onAuthSuccess();

  firebase.auth().onAuthStateChanged(function(user){
    data.sender = user.uid;
    console.log("signed-in to firebase anonymously. Your id is " + user.uid);
  })
}

/**
 * Set up a Firebase with deletion on clicks older than expirySeconds
 * @param {!google.maps.visualization.HeatmapLayer} heatmap The heatmap to
 * which points are added from Firebase.
 */
function initFirebase(heatmap) {

  // 10 minutes before current time.
  var startTime = new Date().getTime() - (60 * 120 * 1000);

  // Reference to the clicks in Firebase.
  // var current = firebase.child('current');
  var current = firebase.database().ref('current');

  // Listener for when a click is added.
  current.orderByChild('timestamp').startAt(startTime).on('child_added',
    function(snapshot) {

      console.log(snapshot.key);

      // Get that click from firebase.
      var newPosition = snapshot.val();
      var point = new google.maps.LatLng(newPosition.lat, newPosition.lng);
      var elapsed = new Date().getTime() - newPosition.timestamp;

      // Add the point to  the heatmap.
      heatmap.getData().push(point);

      // Requests entries older than expiry time (10 minutes).
      var expirySeconds = Math.max(60 * 120 * 1000 - elapsed, 0);

      // Set client timeout to remove the point after a certain time.
      window.setTimeout(function() {
        // Delete the old point from the database.
        snapshot.ref.remove();
      }, expirySeconds);
    }
  );

  // Remove old data from the heatmap when a point is removed from firebase.
  current.on('child_removed', function(snapshot, prevChildKey) {
    var heatmapData = heatmap.getData();
    var i = 0;
    while (snapshot.val().lat != heatmapData.getAt(i).lat
      || snapshot.val().lng != heatmapData.getAt(i).lng) {
      i++;
    }
    heatmapData.removeAt(i);
  });
}

/**
 * Adds a click to firebase.
 * @param {Object} data The data to be added to firebase.
 *     It contains the lat, lng, sender and timestamp.
 */
function addToFirebase(data) {
  getTimestamp(function(timestamp) {
    // Add the new timestamp to the record data.
    data.timestamp = timestamp;
    var ref = firebase.database().ref('current').push(data, function(err) {
      if (err) {  // Data was not written to firebase.
        console.log(err);
      }
    });
  });
}

/**
 * Also called each time the map is clicked.
 * Updates the last_message/ path with the current timestamp.
 * @param {function(Date)} addClick After the last message timestamp has been updated,
 *     this function is called with the current timestamp to add the
 *     click to the firebase.
 */
function getTimestamp(addClick) {
  // Reference to location for saving the last click time.
  var ref = firebase.database().ref('last_message/' + data.sender);

  ref.onDisconnect().remove();  // Delete reference from firebase on disconnect.

  // Set value to timestamp.
  ref.set(firebase.database.ServerValue.TIMESTAMP, function(err) {
    if (err) {  // Write to last message was unsuccessful.
      console.log(err);
    } else {  // Write to last message was successful.
      ref.once('value', function(snap) {
        addClick(snap.val());  // Add click with same timestamp.
      }, function(err) {
        console.log(err);
      });
    }
  });
}