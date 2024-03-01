let canvas;

let routes = {
    777: ['1636\'er', '0099FF'],
    778: ['Allston Loop','A50606'],
    779: ['Barry\'s Corner', '98DF8A'],
    782: ['Commencement/Class Day Quad', '2CA02C'],
    783: ['Crimson Cruiser', 'DB0DD7'],
    3681: ['Harvard Square SEC Summer', '9467BD'],
    2021: [ 'HUIT Route','F4EC07'],
    781: ['Inauguration Day', '2C4096'],
    786: ['Kennedy School Charter AM', '2C4096'],
    787: ['Kennedy School Charter PM', '2C4096'],
    788: ['Mather Crimson Overnight', '2C4096'],
    789: ['Mather Express','0000FF'],
    785: ['Overnight','FF8707'],
    790: ['Quad Express', '136D1C'],
    2235: ['Quad SEC Direct', '9467BD'],
    791: ['Quad Stadium Direct', '14EB27'],
    792: ['Quad Stadium Express', '50BC48'],
    793: ['Quad Yard Express','006600'],
    5707: ['SEC Express', 'FDAE6B'],
    3679: ['Summer Schedule','136D1C'],
    3680: ['Summer School Overnight', 'DB0DD7'],
    2654: ['Thanksgiving Day', '3', 'E14E00'],
};


async function fetchData(path) {
    const response = await fetch(path);
    return response;
}

function csvJSON(csv) {
    var lines = csv.split("\n");
    lines[0] = lines[0].replace("\r", "");
    var result = [];
    var headers = lines[0].split(",");

    for (var i = 1; i < lines.length; i++) {
        var obj = {};
        var currentline = lines[i].split(",");

        console.log(currentline);

        for (var j = 0; j < headers.length; j++) {
            obj[headers[j]] = currentline[j];
        }

        result.push(obj);
    }

    return JSON.stringify(result); //JSON
}

let offsetX = 200;
let offsetY = 50;

async function getFileAsObject(path) {
    const response = await fetchData(path);
    const data = await response.text();
    const object = csvJSON(data);
    return object;
}

let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;

function mapCoord(lat, lon) {
    return {
        x: map(lon, minLon, maxLon, width / 2 + 50, 50),
        y: map(lat, minLat, maxLat, height / 2 + 50, 50)
    };
}

let stops = null;
let shapes = null;
let tripsMap = null; 
let stopTimesMap = null;

async function setup() {
    canvas = createCanvas(1080, 1920);
    canvas.parent('sketch-holder');

    let result = await prepareData();
    stops = result[0];
    shapes = result[1];
    tripsMap = result[2];
    stopTimesMap = result[3];

    frameRate(1);
}


function draw() {
    clear();
    if (stops && shapes && active_trip_ids) {
        draw_routes();
    }
    if (tripsMap) draw_buses();
}

let active_shape_to_route, active_trip_ids;
async function draw_buses() {
    const response = await fetch("https://passio3.com/harvard/passioTransit/gtfs/realtime/vehiclePositions.json");
    const buses = await response.json();

    active_trip_ids = new Set();
    active_shape_to_route = new Map();
    buses.entity.forEach(bus => {
        const {x, y} = mapCoord(bus.vehicle.position.latitude, bus.vehicle.position.longitude);
        active_shape_to_route.set(tripsMap.get(bus.vehicle.trip.trip_id).shape_id, tripsMap.get(bus.vehicle.trip.trip_id).route_id);
        active_trip_ids.add(bus.vehicle.trip.trip_id);
        push();
        fill("#" + routes[tripsMap.get(bus.vehicle.trip.trip_id).route_id][1]);
        // ellipse(x, y, 20);
        pop();
    })

}

async function prepareData() {
    const stopsData = await getFileAsObject('./data/stop_positions.csv');
    const stops = JSON.parse(stopsData);
    stops.forEach(stop => {
        stop.x = parseFloat(stop.x);
        stop.y = parseFloat(stop.y);
    });
    const stopsMap = new Map();

    const shapesData = await getFileAsObject('./data/shapes.txt');
    const shapes = JSON.parse(shapesData);

    const tripsData = await getFileAsObject('./data/trips.txt');
    const trips = JSON.parse(tripsData);
    const tripsMap = new Map();

    const stopTimesData = await getFileAsObject('./data/stop_times.txt');
    const stopTimes = JSON.parse(stopTimesData);
    const stopTimesMap = new Map();
    
    trips.forEach(trip => {
        tripsMap.set(trip.trip_id, { shape_id: trip.shape_id, route_id: trip.route_id });
    });

    stopTimes.forEach(stopTime => {
        if (stopTimesMap.has(stopTime.trip_id)) {
            stopTimesMap.get(stopTime.trip_id).stopInfo.push(stopTime);
        } else {
            stopTimesMap.set(stopTime.trip_id, { stopInfo: [stopTime] });
        }
    });

    shapes.forEach(shape => {
        if (shape.shape_pt_lat < minLat) minLat = shape.shape_pt_lat;
        if (shape.shape_pt_lat > maxLat) maxLat = shape.shape_pt_lat;
        if (shape.shape_pt_lon < minLon) minLon = shape.shape_pt_lon;
        if (shape.shape_pt_lon > maxLon) maxLon = shape.shape_pt_lon;
    });

    return [stops, shapes, tripsMap, stopTimesMap];
}

async function draw_routes() {
    // Plot each stop
    stops.forEach(stop => {
        push();
        ellipse(stop.x, stop.y, 10);
        textSize(8); 
        fill(0);
        noStroke();
        textAlign(CENTER, CENTER);
        text(stop.stop_name, stop.x, stop.y + 20);
        pop();
    });

    active_trip_ids.forEach(trip_id => {
        beginShape();
        noFill();
        const stopInfos = stopTimesMap.get(trip_id).stopInfo;
        stopInfos.forEach(stopInfo => {
            const stop = stops.find(stop => stop.stop_id == stopInfo.stop_id);
            vertex(stop.x, stop.y);
        });
        endShape();
    });

    // let prev = null;
    // let offsetX = 0, offsetY = 0;
    // shapes.forEach(shape => {
    //     noFill();
    //     strokeWeight(3);
    //     if (active_shape_to_route.get(shape.shape_id)) {
    //         if (shape.shape_id != prev) {        
    //             if (prev != null) {
    //                 endShape();
    //                 offsetX += 3;
    //                 offsetY += 3;
    //             }
    //             prev = shape.shape_id;
    //             beginShape();
    //             const route_id = active_shape_to_route.get(shape.shape_id);
    //             stroke("#" + routes[int(route_id)][1]);
    //         }
    //         const {x, y} = mapCoord(shape.shape_pt_lat, shape.shape_pt_lon);
    //         vertex(x + offsetX, y + offsetY);
    //     }
    // });
}
