function setStatus(msg, options) {
  $("#status-msg").text(msg);
  var statusclass = options && options.class ? options.class : "status-info";
  $("#status-msg").attr("class", statusclass);
  var showspinner = (options != undefined)
    && (!isUndefined(options.spinner))
    && options.spinner;
  $("#spinner").toggle(showspinner);
  $("#status").fadeIn();
  if (options && options.timeout) {
    setTimeout(function(){ clearStatus() }, 1000*options.timeout);
  }
}

function clearStatus() {
  $("#status").fadeOut(800);
}

function savePref(name, val) {
 if (config.saveprefs) {
   storeVal(name, val);
 }
}

var map = L.map('map', {
      editable: true,
      editOptions: {
            lineGuideOptions: {
              color: "red",
              weight: 4,
              opacity: 0.5
            }
          }
    });
var track;
var waypoints;
var editLayer;
var route;
var routeStart;
var polystats;
var NEW_TRACK_NAME = "New Track";

var EDIT_NONE = 0;
var EDIT_MANUAL_TRACK = 1;
var EDIT_AUTO_TRACK = 2;
var EDIT_MARKER = 3;
var editMode = EDIT_MANUAL_TRACK;


function setTrackName(name) {
  $("#track-name").text(name);
  document.title = config.appname + " - " + name;
}
function getTrackName() {
  return $("#track-name").text();
}
$("#track-name").click(function() {
  var name = $("#track-name").text();
  name = prompt("Track name:", name);
  if (name) {
    setTrackName(name);
  }
});

/*------------ speed profiles and vehicles -----------*/
// GraphHopper vehicles
// speed profiles = pairs of <slope, meters per second>
var activities = {
  "Walk / Hike": {
    vehicle: "foot",
    speedprofile:
      [ [-35, 0.4722], [-25, 0.555], [-20, 0.6944], [-14, 0.8333], [-12, 0.9722],
        [-10, 1.1111], [-8, 1.1944], [-6, 1.25], [-5, 1.2638], [-3, 1.25],
        [2, 1.1111], [6, 0.9722], [10, 0.8333], [15, 0.6944], [19, 0.5555],
        [26, 0.4166], [38, 0.2777] ],
  },
  "Run":{
    vehicle: "foot",
    speedprofile:
      [ [-16, (12.4/3.6)], [-14,(12.8/3.6)], [-11,(13.4/3.6)], [-8,(12.8/3.6)],
        [-5,(12.4/3.6)], [0,(11.8/3.6)], [9,(9/3.6)], [15,(7.8/3.6)] ],
  },
  "Bike (road)":{
    vehicle: "bike",
    speedprofile:
      [ [-6, 13.8888], [-4, 11.1111], [-2, 8.8888], [0, 7.5], [2, 6.1111],
        [4, (16/3.6)], [6, (11/3.6)] ],
  },
  "Bike (mountain)":{
    vehicle: "bike",
    speedprofile:
      [ [0, 3.33] ],
  },
  "Swim":{
    vehicle: "foot",
    speedprofile:
      [ [0, 0.77] ],
  },
}

var selectActivity = $("#activity")[0];
for (var a in activities) {
  if (hasOwnProperty.call(activities, a)) {
    var opt = document.createElement("option");
    opt.innerHTML = a;
    selectActivity.appendChild(opt);
  }
}

function getCurrentActivity() {
  var res = $("#activity").children(':selected').val()
  log("activity: " + res);
  savePref("activity", res);
  return activities[res];
}

$("#activity").change(function() {
  polystats.setSpeedProfile(getCurrentActivity().speedprofile);
})

/* ------------------------------------------------------------*/

function newTrack() {
  setEditMode(EDIT_NONE);
  setTrackName(NEW_TRACK_NAME);
  if (track) {
    track.remove();
    track = undefined;
  }
  if (waypoints) {
    waypoints.remove();
  }
  if (editLayer) {
    editLayer.remove();
  }
  if (route) {
    route.remove();
    route = undefined;
  }
  routeStart = undefined;
  editLayer = L.layerGroup([]).addTo(map);
  waypoints = L.layerGroup([]).addTo(editLayer);
  track = L.polyline([]);
  track.setStyle({color:"#F00", dashColor:"#F00", });
  track.addTo(editLayer);
  polystats = L.Util.polyStats(track, {
    chrono: true,
    speedProfile:  getCurrentActivity().speedprofile,
    onUpdate: showStats,
  });
  showStats();
}

function newWaypoint(latlng, name, desc) {

  function deletMarker(e) {
    marker.remove();
    map.closePopup();
    e.preventDefault();
  }

  function getMarkerPopupContent(marker) {
    var div = L.DomUtil.create('div', "popupdiv"),
      label, input;

    if (editMode === EDIT_MARKER) {

      // name
      label = L.DomUtil.create('div', "popupdiv", div);
      label.innerHTML = "<span class='popupfield'>Name:</span> ";
      var name = L.DomUtil.create('input', "popup-nameinput", label);
      name.type = "text";
      name.value = marker.options.title ? marker.options.title : "";
      name.onkeyup = function(){
        marker.options.title = name.value;
        var elt = marker.getElement();
        elt.title = name.value;
        elt.alt = name.value;
      };

      // description
      label = L.DomUtil.create('div', "popupdiv", div);
      label.innerHTML = "<span class='popupfield'>Desc:</span> ";
      var desc = L.DomUtil.create('textarea', "popup-descinput", label);
      desc.value = marker.options.desc ? marker.options.desc : "";
      desc.onkeyup = function(){
        marker.options.desc = desc.value;
      };

    } else {

      // name
      if (marker.options.title) {
        var name = L.DomUtil.create('div', "popup-name", div);
        name.innerHTML = marker.options.title;
      }

      // description
      if (marker.options.desc) {
        var desc = L.DomUtil.create('div', "popup-desc", div);
        desc.innerHTML = marker.options.desc;
      }
    }



    var latlng = marker.getLatLng();
    var div = getLatLngPopupContent(latlng, deletMarker, div)
    return div;
  }

  var marker = L.marker(latlng, {
    title: name,
    desc: desc,
    alt: name
  }).addTo(waypoints);

  marker.on("click", function() {
    pop = L.popup()
        .setLatLng(marker.getLatLng())
        .setContent(getMarkerPopupContent(marker))
        .openOn(map);
  });

  return marker;
}

/* ------------------------ TRIMMING ---------------------------------- */

var polytrim;
function prepareTrim() {
  var trimMax = Math.round(track.getLatLngs().length / 2);
  $("#trim-txt").text("");
  $("#trim-range").attr("max", trimMax);
  $("#trim-range").val(0);
  $(".no-trim").prop('disabled',false);
  var trimType = $("#trim-type")[0].selectedIndex;
  polytrim = L.Util.polyTrim(track, trimType);
}

function trimTrack(e) {
  var n = parseInt($("#trim-range").val());
  log("trimming " + n);
  $("#trim-txt").text(n + "/" + polytrim.getPolySize());
  $(".no-trim").prop('disabled',(n != 0));
  polytrim.trim(n);
}

function finishTrim() {
  if (polytrim.getDirection() === polytrim.FROM_END) {
    // From End
    polystats.updateStatsFrom(track.getLatLngs().length-1);
  } else {
    // From Start
    polystats.updateStatsFrom(0);
  }
  polytrim = undefined;
}

$("#trim-range").on("change", trimTrack)
$("#trim-type").change(prepareTrim);

/* ------------------------ MENU ---------------------------------- */

$("#menu-button").click(function() {
  if (!$("#menu").is(":visible")) {
    setEditMode(EDIT_NONE);
    $("#menu").show();
    prepareTrim();
  } else {
    $("#menu").hide();
    finishTrim();
  }
  return false;
})
$("#menu-close").click(function() {
  $("#menu").hide();
  finishTrim();
  return false;
})
$("#track-new").click(function() {
  newTrack();
  setEditMode(EDIT_MANUAL_TRACK);

})
$("#menu-track").click(function() {
  $(".collapsable-track").toggle();
})
$("#menu-tools").click(function() {
  $(".collapsable-tools").toggle();
})

/* ------------------------ EXPORT GPX ---------------------------------- */

function LatLngToGPX(latlng, gpxelt, name, time, desc) {
  function showDateTime(time) {
    var strTime = "P";
    if (time >= 3600) strTime += Math.floor(time/3600) + "H";
    time %= 3600;
    if (time >= 60) strTime += Math.floor(time/60) + "M";
    time %= 60;
    strTime += Math.round(time) + "S";
    return strTime
  }

  var gpx = "<"+gpxelt;
  gpx += " lat=\"" + latlng.lat+ "\" lon=\"" + latlng.lng + "\">";
  if (name) {
    gpx += "<name>" + htmlEncode(name, false, 0)  + "</name>";
  }
  if (desc) {
    gpx += "<desc>" + htmlEncode(desc, false, 0)  + "</desc>";
  }
  if (latlng.alt) {
    gpx += "<ele>" + latlng.alt + "</ele>";
  }
  if (time) {
    gpx += "<time>" + (typeof time === "string" ? time : showDateTime(time)) + "</time>";
  }
  gpx += "</"+gpxelt+">\n"
  return gpx;
}

function getGPX(trackname, savealt, savetime, asroute, nometadata) {

  var gpx = '<\?xml version="1.0" encoding="UTF-8" standalone="no" \?>\n';
  gpx += '<gpx creator="' + config.appname + '" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.topografix.com/GPX/1/1" version="1.1" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n';
  if (!nometadata) {
    gpx += "<metadata>\n";
    gpx += "  <name>" + trackname + "</name>\n";
    gpx += "  <desc></desc>\n";
    gpx += "  <author><name>" + config.appname + "</name></author>\n";
    gpx += "  <link href='" + window.location.href + "'>\n";
    gpx += "    <text>" + config.appname + "</text>\n";
    gpx += "    <type>text/html</type>\n";
    gpx += "  </link>\n";
    var t = new Date();
    gpx += "  <time>" + t.toISOString() + "</time>\n";
    var sw = map.getBounds().getSouthWest();
    var ne = map.getBounds().getNorthEast();
    gpx += '<bounds minlat="' + Math.min(sw.lat, ne.lat) + '" minlon="' + Math.min(sw.lng, ne.lng) + '" maxlat="' + Math.max(sw.lat, ne.lat) + '" maxlon="'+ Math.max(sw.lng, ne.lng) + '"/>';
    gpx += "</metadata>\n";
  }
  var wpts = waypoints ? waypoints.getLayers() : undefined;
  if (wpts && wpts.length > 0) {
    var i = 0;
    while (i < wpts.length) {
      var wpt = wpts[i];
      gpx += "  " + LatLngToGPX(wpt.getLatLng(), "wpt", wpt.options.title, wpt.getLatLng().time, wpt.options.desc);
      i++;
    }
  }
  var latlngs = track ? track.getLatLngs() : undefined;
  if (latlngs && latlngs.length > 0) {
    var xmlname = "<name>" + trackname + "</name>";
    if (asroute) {
      gpx += "<rte>" + xmlname + "\n";
    } else {
      gpx += "<trk>" + xmlname + "<trkseg>\n";
    }
    var i = 0;
    while (i < latlngs.length) {
      var pt = latlngs[i];
      gpx += "  " + LatLngToGPX(pt, asroute ? "rtept" : "trkpt", undefined, pt.time);
      i++;
    }
    if (asroute) {
      gpx += "</rte></gpx>\n";
    } else {
      gpx += "</trkseg></trk></gpx>\n";
    }
  }
  return gpx;
}

$("#track-download").click(function() {
  setEditMode(EDIT_NONE);
  setStatus("Formatting..", {spinner: true});
  var asroute = $("#as-route").is(":checked");
  var nometadata = $("#nometadata").is(":checked");
  var trackname =  getTrackName();
  var gpx = getGPX(trackname, /*savealt*/false, /*savetime*/false, asroute, nometadata);
  var blob = new Blob([gpx], {type: "application/gpx+xml;charset=utf-8"});
  saveAs(blob, trackname+".gpx");
  clearStatus();
})

function editableWaypoints(editable) {
  var wpts = waypoints.getLayers();
  for (var i=0; i< wpts.length; i++) {
    if (editable) {
      wpts[i].enableEdit();
    } else {
      wpts[i].disableEdit();
    }
  }
}

function mergeRouteToTrack() {
  if (!route) return;
  var initlen = track.getLatLngs().length;
  var pts = route._selectedRoute.coordinates;
  pts = L.PolyUtil.prune(pts, config.compressdefault);
  route.remove();
  route = undefined;
  routeStart = undefined;
  for (var j = 0; j < pts.length; j++) {
    track.addLatLng(pts[j]);
  }
  elevate(pts, function() {
    polystats.updateStatsFrom(initlen);
  });
}

function setRouteStart(latlng) {
  routeStart = latlng;
  $("#map").css("cursor", "alias");
}

function closeOverlays() {
  // close all
  $("#menu").hide();
  map.closePopup();
  hideElevation();
}

function restartRoute() {
  if (route) {
    route.remove();
    route = undefined;
    routeStart = undefined;
  }
  $("#map").css("cursor", "copy");
  var ll = track.getLatLngs();
  if (ll.length > 0) {
    setRouteStart(ll[ll.length-1]);
  }
}

function setEditMode(mode) {
  closeOverlays();
  if (mode === editMode) {
    return;
  }
  switch (editMode) {
    case EDIT_MANUAL_TRACK:
      if (track) {
        track.disableEdit();
      }
      break;
    case EDIT_AUTO_TRACK:
      mergeRouteToTrack();
      break;
    case EDIT_MARKER:
      editableWaypoints(false);
      break;
    default:
  }
  map.editTools.stopDrawing();
  $("#edit-tools a").removeClass("edit-tool-selected");
  switch (mode) {
    case EDIT_NONE:
      break;
    case EDIT_MANUAL_TRACK:
      $("#edit-manual").addClass("edit-tool-selected");
      track.enableEdit();
      track.editor.continueForward();
      break;
    case EDIT_AUTO_TRACK:
      $("#edit-auto").addClass("edit-tool-selected");
      restartRoute();
      break;
    case EDIT_MARKER:
      $("#edit-marker").addClass("edit-tool-selected");
      $("#map").css("cursor", "url(img/marker-pointer.png) 7 25,text");
      editableWaypoints(true);
      break;
    default:
      error("invalid edit mode: " + mode);
      return;
  }
  editMode = mode;
}

$("#compress").click(function() {
  // get & check input value
  var prunedist = $("#prunedist");
  var input = prunedist.val().trim();
  var tolerance = undefined;
  if (input) {
    tolerance = Number(input);
  }
  if ((tolerance === undefined) || isNaN(tolerance)) {
    alert("Enter distance in meters");
    prunedist.focus();
    return;
  }

  if (track) {
    setEditMode(EDIT_NONE);
    var pts = track.getLatLngs();
    var pruned = L.PolyUtil.prune(pts, tolerance);
    var removedpts = (pts.length - pruned.length);
    if (removedpts> 0) {
      alert("Removed " + removedpts + " points out of " + pts.length + " (" + Math.round((removedpts / pts.length) * 100) + "%)")
      // switch to new values
      track.setLatLngs(pruned);
    } else {
      setStatus("Already optimized", {timeout:3});
    }
  }
});

function getMyIpLocation(defpos) {
  log("Getting location from IP address");
  var geoapi = "https://freegeoip.net/json/?callback=";
  $.getScript(geoapi+"setMyIpLocation")
  .fail(function( jqxhr, settings, exception ) {
    warn("freegeoip request failed");
  });
}

function setMyIpLocation(res) {
  setLocation({
    lat: res.latitude,
    lng: res.longitude
  });
}

function setLocation(pos) {
  map.setView(pos, config.display.zoom);
}

function gotoMyLocation(defpos) {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(position) {
      setLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      });
    }, function(err){
      log("Geolococation failed: [" + err.code + "] " + err.message);
      getMyIpLocation(defpos);
    });
  } else {
    getMyIpLocation(defpos);
  }
}

function getSavedPosition(_lat, _lng) {
  var vlat = getVal("poslat", _lat);
  var vlng = getVal("poslng", _lng);
  var pos = {
    lat: Number.parseFloat(vlat),
    lng: Number.parseFloat(vlng)
  };
  return pos;
}

function savePosition() {
  var pos = map.getCenter();
  savePref("poslat",pos.lat);
  savePref("poslng",pos.lng);
}

function saveMapType() {
  savePref("maptype", map.getMapTypeId());
}

function getProvider(name) {
  var p = undefined;
  if (name == "opentopomap") {
    p =  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="https://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
    });
  } else if (name == "osm:std") {
    p = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    });
  } else if (name == "osm:hot") {
    p = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    });
  } else if (name == "tf:cycle") {
    p = L.tileLayer('https://{s}.tile.thunderforest.com/cycle/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.thunderforest.com/">Thunderforest</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    });
  } else if (name == "tf:outdoors") {
    p = L.tileLayer('https://{s}.tile.thunderforest.com/outdoors/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.thunderforest.com/">Thunderforest</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    });
  } else if (name == "wmf:hikebike") {
    //p = L.tileLayer('http://{s}.tiles.wmflabs.org/hikebike/{z}/{x}/{y}.png', {
    p = L.tileLayer('https://tiles.wmflabs.org/hikebike/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    });
  }  else if (name == "esri:worldtopomap") {
    p = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
    });
  }  else if (name == "esri:worldstreetmap") {
    p = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
    });
  }  else if (name == "mtbmap") {
    p = L.tileLayer('http://tile.mtbmap.cz/mtbmap_tiles/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &amp; USGS'
    });
  } else if (name == 'google:roadmap') {
    p = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',{
        maxZoom: 20,
        subdomains:['mt0','mt1','mt2','mt3']
    });
  } else if (name == 'google:terrain') {
    p = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',{
        maxZoom: 20,
        subdomains:['mt0','mt1','mt2','mt3']
    });
  } else if (name == 'google:satellite') {
    p = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',{
        maxZoom: 20,
        subdomains:['mt0','mt1','mt2','mt3']
    });
  } else if (name == 'google:hybrid') {
    p = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',{
        maxZoom: 20,
        subdomains:['mt0','mt1','mt2','mt3']
    });
  } else if (name == 'wmf:hills') {
    //p = L.tileLayer('http://{s}.tiles.wmflabs.org/hillshading/{z}/{x}/{y}.png',{
    p = L.tileLayer('https://tiles.wmflabs.org/hillshading/{z}/{x}/{y}.png',{
      maxZoom: 17,
      attribution: 'Hillshading: SRTM3 v2 (<a href="https://www2.jpl.nasa.gov/srtm/">NASA</a>)'
    });
  } else if (name == 'lv:hike') {
    p = L.tileLayer('http://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',{
        maxZoom: 17,
      attribution: 'Hiking Routes: (<a href="http://hiking.lonvia.de">Lonvias Hiking Map</a>)'
    });
  } else if (name == 'lv:bike') {
    p = L.tileLayer('http://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png',{
        maxZoom: 17,
      attribution: 'Cycling Routes: (<a href="http://cycling.lonvia.de">Lonvias Cycling Map</a>)'
    });
  }
  if (!p) {
    p = getProvider("osm:std");
  }
  return p;
}

var baseLayers = {
  "Open Topo": getProvider("opentopomap"),
  "OpenStreetMap": getProvider("osm:std"),
  "OpenCycleMap": getProvider("tf:cycle"),
  "Outdoors": getProvider("tf:outdoors"),
  "OSM HOT": getProvider("osm:hot"),
  "OSM HikeBike": getProvider("wmf:hikebike"),
  "ESRI Topo": getProvider("esri:worldtopomap"),
  "ESRI Street": getProvider("esri:worldstreetmap"),
  "MTB (*)": getProvider("mtbmap"),
  "Google roads": getProvider('google:roadmap'),
  "Google Terrain": getProvider('google:terrain'),
  "Google Satellite": getProvider('google:satellite'),
  "Google Hybrid": getProvider('google:hybrid')
};
var overlays = {
  "Hillshading": getProvider("wmf:hills"),
  "Hiking Routes (*)": getProvider("lv:hike"),
  "Cycling Routes (*)": getProvider("lv:bike"),
};
L.control.layers(baseLayers, overlays).addTo(map);
map.addLayer(baseLayers[getVal("baseLayer", config.display.map)] || baseLayers[config.display.map]);
map.on("baselayerchange", function(e) {
  savePref("baseLayer", e.name);
});
function getOverlays() {
  var v = getVal("overlays");
  return v ? JSON.parse(v) : {};
}

function setOverlay(name, yesno) {
  var cfg = getOverlays();
  cfg[name] = yesno;
  v = JSON.stringify(cfg);
  savePref("overlays", v);
}

if (JSON.parse && JSON.stringify) {

  var cfg = getOverlays();
  for (var name in cfg) {
    if (cfg.hasOwnProperty(name) && cfg[name]) {
      var ol = overlays[name];
      if (ol) {
        map.addLayer(overlays[name]);
      } else {
        // doesn't exist anymore, delete it
        setOverlay(name, undefined);
      }
    }
  }

  map.on("overlayadd", function(e) {
    setOverlay(e.name, true);
  });

  map.on("overlayremove", function(e) {
    setOverlay(e.name, false);
  });

}

var defpos = getSavedPosition(config.display.pos.lat, config.display.pos.lng);
setLocation(defpos); // required to initialize map

$(".leaflet-control-layers-list").append("<div class='leaflet-control-layers-separator'></div>");
$(".leaflet-control-layers-list").append("<div>(*): no https</div>");

// http://www.datasciencetoolkit.org/developerdocs#coordinates2statistics API - free
function elevateDSTK(pt, cb) {

  var elevateDSTKerror = function(jqXHR, textStatus, errorThrown) {
    setStatus("Elevation failed", {timeout:3, class:"status-error"});
    error('Error: ' +  textStatus);
    // callback
    if (cb) cb(false);
  }
  var elevateDSTKcb = function(result) {
    var ok = isUndefined(result['error']);
    if (ok) {
      clearStatus();
      pt.alt = result[0].statistics.elevation.value;
      // callback
      if (cb) cb(true);
    } else {
      elevateDSTKerror(null, result['error']);
    }
  };

  var apiUrl = "http://www.datasciencetoolkit.org/coordinates2statistics/" + pt.lat + "%2c" + pt.lng + "?statistics=elevation";

  $.ajax(apiUrl, {
    success: elevateDSTKcb,
    error: elevateDSTKerror,
    dataType: 'jsonp',
    crossDomain: true
  });

}

// Google elevation API - free upto 2500 req per day (max 512 points per req)
function elevateGoogle(points, cb) {
  if (!points || (points.length == 0)) {
    return;
  }
  var locations;
  var inc;
  if (isUndefined(points.length)) {
    locations = [points];
  } else {
    setStatus("Elevating..", {spinner: true});
    inc = Math.round(Math.max(1, points.length/512))
    if (inc = 1) {
      locations = points;
    } else {
      locations = [];
      for (var i = 0; i < points.length; i+=inc) {
        locations.push(points[i]);
      }
      // make sure last point is included
      if (i < points.length) {
        locations.push(points[points.length-1]);
      }
    }
  }
  var elevator = new google.maps.ElevationService;
  elevator.getElevationForLocations({
    'locations': locations
  }, function(results, status) {
    if (status === 'OK') {
      clearStatus();
      if (points.length) {
        for (var i = 0; i < points.length; i+=inc) {
          var pos = i*inc;
          points[pos<points.length ? pos : points.length].alt = results[i].elevation;
        }
      } else {
        points.alt = results[0].elevation;
      }
    } else {
      setStatus("Elevation failed", {timeout:3, class:"status-error"});
      warn("elevation request not OK: " + status);
    }
    // callback
    if (cb) cb(status === 'OK');
  });
}
var elevate = elevateGoogle;
var elevatePoint = elevateGoogle;


function flatten() {
  setStatus("Flatening..", {spinner: true});
  var points = track ? track.getLatLngs() : undefined;
  if (points && (points.length > 0)) {
    for (var i = 0; i < points.length; i++) {
      points[i].alt = 0;
    }
  }
  clearStatus();
}

new L.Control.GeoSearch({
    provider: new L.GeoSearch.Provider.OpenStreetMap(),
    position: 'topleft',
    showMarker: false,
    showPopup: true,
    customIcon: false,
    retainZoomLevel: true,
    draggable: false
  }).addTo(map);

L.EditControl = L.Control.extend({

    options: {
        position: 'topleft',
        kind: '',
        html: '',
        event: 'click'
    },

    onAdd: function (map) {
        var container = L.DomUtil.create('div', 'leaflet-control leaflet-bar leaflet-control-edit'),
            link = L.DomUtil.create('a', '', container),
            editopts = L.DomUtil.create('span', '', container);

        link.href = '#';
        link.title = this.options.title;
        link.innerHTML = this.options.html;
        L.DomEvent.disableClickPropagation(link);
        L.DomEvent.on(link, this.options.event, L.DomEvent.stop)
                  .on(link, this.options.event, function (e) {
                    map.closePopup();
                    var et = $("#edit-tools");
                    et.toggle();
                    if (!et.is(":visible")) {
                      setEditMode(EDIT_NONE);
                    }
                    //return false;
                  }, this);

        editopts.id = 'edit-tools';
        editopts.innerHTML = '<a href="#" title="Manual Track" id="edit-manual">&nbsp;</a><a href="#" title="Auto Track" id="edit-auto">&nbsp;</a><a href="#" title="Waypoint" id="edit-marker">&nbsp;</a>';

        return container;
    }

});
L.EditorControl = L.EditControl.extend({
    options: {
        position: 'topleft',
        title: 'Edit',
        html: '&#x270e;',
        event: 'click'
    }
});
map.addControl(new L.EditorControl());

$("body").keydown(function(event) {
  if ( event.which == 27 ) {
    setEditMode(EDIT_NONE);
  }
});


L.DomEvent.disableClickPropagation(L.DomUtil.get("edit-manual"));
L.DomEvent.disableClickPropagation(L.DomUtil.get("edit-auto"));
L.DomEvent.disableClickPropagation(L.DomUtil.get("edit-marker"));
$("#edit-manual").click(function (e) {
  //$("#edit-tools").hide();
  setEditMode(EDIT_MANUAL_TRACK);
  e.preventDefault();
});
$("#edit-auto").click(function (e) {
  //$("#edit-tools").hide();
  setEditMode(EDIT_AUTO_TRACK);
  e.preventDefault();
});
$("#edit-marker").click(function (e) {
  //$("#edit-tools").hide();
  setEditMode(EDIT_MARKER);
  e.preventDefault();
});

$("#elevate").click(function (e) {
  $("#menu").hide();
  if (track) elevate(track.getLatLngs(), function() {
    polystats.updateStatsFrom(0);
  });
  return false;
});
$("#flatten").click(function (e) {
  $("#menu").hide();
  flatten();
  return false;
});

$(".statistics").click(function(e){
  var tag = e.target.tagName.toUpperCase();
  if ((tag !== "SELECT") && (tag !== "OPTION")) {
    toggleElevation(e);
  }
})

function importGeoJson(geojson) {

  setStatus("Loading..", {spinner: true});
  newTrack();
  $("#edit-tools").hide();
  var bounds = L.latLngBounds([]);

  function newPoint(coord, time, i) {
    var point = L.latLng(coord[1], coord[0]);
    if (coord.length > 2) {
      // alt
      point.alt = coord[2];
    }
    if (!isUndefined(time)) {
      point.time = time;
    }
    if (!isUndefined(i)) {
      point.i = i;
    }
    return point;
  }

  L.geoJson(geojson,{
    onEachFeature: function(f) {
      if (f.geometry.type === "LineString") {
        if (track.getLatLngs().length == 0) {
          // import polyline vertexes
          var v = [];
          setTrackName(f.properties.name ? f.properties.name : NEW_TRACK_NAME);
          var coords = f.geometry.coordinates;
          var times = f.properties.coordTimes && (f.properties.coordTimes.length == coords.length) ? f.properties.coordTimes : undefined;
          for (var i = 0; i < coords.length; i++) {
            v.push(newPoint(coords[i], times ? times[i] : undefined, i));
          }

          track.setLatLngs(v);
          bounds.extend(track.getBounds());
        }
      } else if (f.geometry.type === "Point") {
        // import marker
        var coords = f.geometry.coordinates;
        var latlng = newPoint(coords);
        newWaypoint(latlng, f.properties.name, f.properties.description || f.properties.desc);
        bounds.extend(latlng);
      }
    }
  })
  map.fitBounds(bounds);
  clearStatus();
  polystats.updateStatsFrom(0);
  return editLayer;
}

var fileloader = L.Util.fileLoader(map, {
    // Allows you to use a customized version of L.geoJson.
    // For example if you are using the Proj4Leaflet leaflet plugin,
    // you can pass L.Proj.geoJson and load the files into the
    // L.Proj.GeoJson instead of the L.geoJson.
    layer: importGeoJson,
    // See http://leafletjs.com/reference.html#geojson-options
    layerOptions: {style: {color:'red'}},
    // Add to map after loading (default: true) ?
    addToMap: false,
    // File size limit in kb (default: 1024) ?
    fileSizeLimit: config.maxfilesize,
    // Restrict accepted file formats (default: .geojson, .kml, and .gpx) ?
    formats: [
        '.gpx',
        '.geojson',
        '.kml'
    ]
});
fileloader.on('data:error', function (e) {
  setStatus("Failed: check file and type", { 'class':'status-error', 'timeout': 3});
});

function loadFromUrl(url, ext) {
  $.get('https://jsonp.afeld.me/?url='+url, function(data){
    fileloader.loadData(data, url, ext);
  });
}
$("#track-get").click(function() {
  var url = $("#track-get-url").val().trim();
  if (!url) {
    $("#track-get-url").focus();
    return;
  }
  setEditMode(EDIT_NONE);
  setStatus("Getting..", {spinner: true});
  var ext = $("input[name=track-get-ext]:checked").val();
  if (ext === "auto") {
    ext = undefined
  }
  loadFromUrl(url, ext);
})
$("#track-get-url").keypress(function(e) {
  if (e.which == 13) {
    $("#track-get").click();
  }
});

$("#track-upload").change(function() {
  setEditMode(EDIT_NONE);
  setStatus("Getting..", {spinner: true});
  var file = $("#track-upload")[0].files[0];
  fileloader.load(file);
})

function newRouteWaypoint(i, waypoint, n) {

  function getRouteWaypoinContent(latlng, index) {
    var div = document.createElement("div");

    p = L.DomUtil.create("div", "popupdiv", div);
    var del = L.DomUtil.create('a', "", p);
    del.class = "sympol red";
    del.href = "#";
    del.title = "Delete";
    del.innerHTML = "<span class='popupfield'>DELETE</span>"
    del.onclick = function(e) {
      var wpts = route.getWaypoints();
      if (wpts.length > 2) {
        wpts.splice(index,1);
        route.setWaypoints(wpts);
      } else {
        restartRoute();
      }
      map.closePopup();
      e.preventDefault();
    };

    return div;
  }

  if ((track.getLatLngs().length > 0)  && (i == 0)) {
    // no start marker for routes that continue an existing track
    return undefined
  };
  var marker = L.marker(waypoint.latLng, {
    draggable: true
  });

  marker.on("click", function(e) {

    var pop = L.popup()
        .setLatLng(e.latlng)
        .setContent(getRouteWaypoinContent(e.latlng, i))
        .openOn(map);

  });

  return marker;
}



function getTrackPointPopupContent(latlng) {
  var div = L.DomUtil.create('div', "popupdiv"),
    data;

  var pts = track.getLatLngs();
  var last = pts[pts.length-1];
  var first = pts[0];
  var stats = track.stats;

  data = L.DomUtil.create('div', "popupdiv", div);
  data.innerHTML = "<span class='popupfield'>Distance:</span> " +
    dist2txt(latlng.dist) + " / " + dist2txt(last.dist*2-latlng.dist);
  data = L.DomUtil.create('div', "popupdiv", div);
  data.innerHTML = "<span class='popupfield'>Time:</span> " +
    time2txt(latlng.chrono) + " / " + time2txt(latlng.chrono_rt);

  return div;

}

function getLatLngPopupContent(latlng, deletefn, toadd) {
  var div = document.createElement("div");

  var p = L.DomUtil.create("div", "popupdiv", div);
  p.innerHTML = "<span class='popupfield'>Position:</span> " + latlng.lat + "," + latlng.lng;

  if (editMode != EDIT_NONE) {

    p = L.DomUtil.create("div", "popupdiv", div);
    p.innerHTML = "<span class='popupfield'>Altitude:</span> ";
    var altinput = L.DomUtil.create('input', "", p);
    altinput.type = "text";
    altinput.size = "5";
    altinput.value = isUndefined(latlng.alt) ? "" : latlng.alt;
    altinput.onkeyup = function(){
      try {
        latlng.alt = $.isNumeric(altinput.value) ? Number(altinput.value) : undefined;
      } catch (e) {
      }
    };
    p = L.DomUtil.create("span", "", p);
    p.innerHTML = "m";
  } else {
    if (!isUndefined(latlng.alt)) {
      p = L.DomUtil.create("div", "popupdiv", div);
      p.innerHTML = "<span class='popupfield'>Altitude:</span> " + latlng.alt + "m";
    }
  }

  if (toadd) {
    div.appendChild(toadd);
  }

  if (editMode != EDIT_NONE) {
    p = L.DomUtil.create("div", "popupdiv", div);
    var del = L.DomUtil.create('a', "", p);
    del.class = "sympol red";
    del.href = "#";
    del.title = "Delete";
    del.innerHTML = "<span class='popupfield'>DELETE</span>"
    del.onclick = deletefn;
  }

  return div;
}

function alt2txt(alt) {
  if (alt === undefined) {
    return "?";
  } else {
    alt = Math.round(alt);
    return alt + "m";
  }
}


function dist2txt(dist) {
  dist = Math.round(dist);
  if (dist > 5000) {
    return (dist/1000).toFixed(1) + "km";
  } else {
    return dist + "m";
  }
}

function time2txt(time) {
  var strTime = "";
  if (time >= 3600) strTime += Math.floor(time/3600) + "h";
  time %= 3600;
  if (time >= 60) strTime += Math.floor(time/60) + "m";
  time %= 60;
  strTime += Math.round(time) + "s";
  return strTime
}

function showStats() {
  var pts = track ? track.getLatLngs() : undefined;
  if (pts && pts.length > 0) {
    var last = pts[pts.length-1];
    var first = pts[0];
    var stats = track.stats;
    $("#distow").text(dist2txt(last.dist));
    $("#distrt").text(dist2txt(2*last.dist));
    $("#timeow").text(time2txt(last.chrono));
    $("#timert").text(time2txt(first.chrono_rt));
    $("#altmin").text(alt2txt(stats.minalt));
    $("#altmax").text(alt2txt(stats.maxalt));
    $("#climbing").text("+" + alt2txt(stats.climbing));
    $("#descent").text(alt2txt(stats.descent));
  } else {
    $("#distow").text(dist2txt(0));
    $("#distrt").text(dist2txt(0));
    $("#timeow").text(time2txt(0));
    $("#timert").text(time2txt(0));
    $("#altmin").text(alt2txt(0));
    $("#altmax").text(alt2txt(0));
    $("#climbing").text("+" + alt2txt(0));
    $("#descent").text("-" + alt2txt(0));
  }
}


map.on('popupclose', function (e) {
    console.log(e.type);
    if ((editMode === EDIT_MANUAL_TRACK) && (track.editor)) {
      track.editor.continueForward();
    }
})
map.on('editable:enable', function (e) {
    console.log(e.type);
})
map.on('editable:drawing:start', function (e) {
    console.log(e.type);
})
map.on('editable:drawing:dragend', function (e) {
    console.log(e.type);
})
map.on('editable:drawing:commit', function (e) {
    console.log(e.type);
})
map.on('editable:drawing:end', function (e) {
    console.log(e.type);
})
map.on('editable:drawing:click', function (e) {
  console.log(e.type);
})
map.on('editable:shape:new', function (e) {
  console.log(e.type);
})
map.on('editable:vertex:create', function (e) {
  var latlng = e.vertex.getLatLng();
  if (isUndefined(latlng.i)) {
    var prev = e.vertex.getPrevious();
    i = isUndefined(prev) ? 0 : prev.latlng.i + 1;
    latlng.i = i;
    if (i == track.getLatLngs().length - 1) {
      // last vertex
      elevatePoint(latlng, function() {
        polystats.updateStatsFrom(i);
      });
    }
  }
  console.log(e.type + ": " + latlng.i);
})
map.on('editable:vertex:dragend', function (e) {
  var i = e.vertex.getLatLng().i;
  elevatePoint(e.vertex.getLatLng(), function() {
    polystats.updateStatsFrom(i);
  });
  console.log(e.type + ": " + i);
})
map.on('editable:middlemarker:mousedown', function (e) {
  console.log(e.type);
})
map.on('editable:dragend', function (e) {
  elevatePoint(e.layer.getLatLng());
  console.log(e.type);
})

map.on('editable:vertex:deleted', function (e) {
  var i = e.latlng.i;
  console.log(e.type + ": " + i);
  polystats.updateStatsFrom(i);
})


map.on('editable:created', function (e) {
  console.log("Created: " + e.layer.getEditorClass());
});
map.on('click', function (e) {

  if (editMode == EDIT_MARKER) {
    var marker = newWaypoint(e.latlng);
    elevatePoint(e.latlng);
    marker.enableEdit();
  } else if (editMode == EDIT_AUTO_TRACK) {
    if (!route) {
      if (!routeStart) {
        setRouteStart(e.latlng);
      } else {
        var fromPt = routeStart,
            toPt = e.latlng;
        route = L.Routing.control({
          router: L.Routing.graphHopper(config.graphhopper.key(), {urlParameters: {vehicle: getCurrentActivity().vehicle}}),
          waypoints: [ fromPt, toPt ],
          routeWhileDragging: false,
          autoRoute: true,
          fitSelectedRoutes: false,
          lineOptions: {
            styles: [{
                color: "red",
                weight: 3,
                opacity: 1
            }],
            addWaypoints: true
          },
          createMarker: newRouteWaypoint,
          show: false
        }).addTo(map);
      }
    } else {
      var wpts = route.getWaypoints();
      wpts.push({latLng: e.latlng});
      route.setWaypoints(wpts);
    }
  } else {
    closeOverlays();
  }
});

map.on('editable:vertex:click', function (e) {

  function deleteTrackPoint(event) {
    e.vertex.delete();
    map.closePopup(pop);
    event.preventDefault();
  }

  track.editor.commitDrawing();
  e.cancel();
  var div = getTrackPointPopupContent(e.latlng);
  var pop = L.popup()
      .setLatLng(e.latlng)
      .setContent(getLatLngPopupContent(e.latlng, deleteTrackPoint, div))
      .openOn(map);
  $(".leaflet-popup-close-button").click(function(e) {
    track.editor.continueForward();
    return false;
  });
});

// ---- ELEVATION
var elevation;
function hideElevation() {
  if (elevation) toggleElevation();
}
function toggleElevation(e) {
  if (!elevation) {
    setEditMode(EDIT_NONE);
    map.closePopup();
    var el = L.control.elevation();
    el.addTo(map);
    var gjl = L.geoJson(track.toGeoJSON(),{
                onEachFeature: el.addData.bind(el)
            });
    gjl.setStyle({opacity:0});
    gjl.addTo(map);
    elevation = {
      el: el,
      gjl: gjl
    };
  } else {
    elevation.gjl.remove();
    elevation.el.remove();
    elevation = undefined;
  }
}

$(".appname").text(config.appname);
$("#prunedist").val(config.compressdefault);
setStatus("Welcome to " + config.appname + "!", {timeout:3});

if (config.google && config.google.analyticsid) {
  initGoogleAnalytics(config.google.analyticsid());
}
if (config.email) {
  setEmailListener(config.email.selector, config.email.name,
    config.email.domain, config.email.subject);
}

var url = getParameterByName("url");
if (url) {
  var ext = getParameterByName("ext");
  loadFromUrl(url, ext || undefined);
} else {
  newTrack();
  setEditMode(EDIT_MANUAL_TRACK);
  if (window.location.toString().startsWith('http')) {
    gotoMyLocation(defpos);
  } else {
    getMyIpLocation(defpos);
  }
}
