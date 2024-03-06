<script>
	import { onMount } from 'svelte';
	import * as d3 from 'd3';


    let data = [];
    let routes = {
        777: ['1636\'er', '0099FF'],
        778: ['Allston Loop', 'A50606'],
        779: ['Barry\'s Corner', '98DF8A'],
        782: ['Commencement/Class Day Quad', '2CA02C'],
        783: ['Crimson Cruiser', 'DB0DD7'],
        3681: ['Harvard Square SEC Summer', '9467BD'],
        2021: ['HUIT Route', 'F4EC07'],
        781: ['Inauguration Day', '2C4096'],
        786: ['Kennedy School Charter AM', '2C4096'],
        787: ['Kennedy School Charter PM', '2C4096'],
        788: ['Mather Crimson Overnight', '2C4096'],
        789: ['Mather Express', '0000FF'],
        785: ['Overnight', 'FF8707'],
        790: ['Quad Express', '136D1C'],
        2235: ['Quad SEC Direct', '9467BD'],
        791: ['Quad Stadium Direct', '14EB27'],
        792: ['Quad Stadium Express', '50BC48'],
        793: ['Quad Yard Express', '006600'],
        5707: ['SEC Express', 'FDAE6B'],
        3679: ['Summer Schedule', '136D1C'],
        3680: ['Summer School Overnight', 'DB0DD7'],
        2654: ['Thanksgiving Day', '3', 'E14E00'],
    };
	for (let i = 0; i < 100; ++i) {
		data.push({
			x: Math.random() * 10,
			y: Math.random() * 10
		})
	}
	
	let el;

    let stops = null;
    let shapes = null;
 
    let tripsMap = null;
    let stopTimesMap = null;
    let vehiclePositions = null;

    const margin = {
		top: 20,
		right: 20,
		bottom: 30,
		left: 30
	};

    function csvJSON(csv) {
        var lines = csv.split("\n");
        lines[0] = lines[0].replace("\r", "");
        var result = [];
        var headers = lines[0].split(",");

        for (var i = 1; i < lines.length; i++) {
            var obj = {};
            var currentline = lines[i].split(",");

            for (var j = 0; j < headers.length; j++) {
                obj[headers[j]] = currentline[j];
            }

            result.push(obj);
        }

        return JSON.stringify(result);
    }

    async function getFileAsObject(path) {
        const response = await fetch(path);
        const data = await response.text();
        const object = csvJSON(data);
        return object;
    }

    let all_trip_ids = new Set();
    async function prepare_data() {
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
            all_trip_ids.add(trip.trip_id);
        });
        console.log(all_trip_ids.size);

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

    let active_shape_to_route, active_trip_ids;
    let active_bus_locations; 
    async function draw_buses() {
        const response = await fetch("https://passio3.com/harvard/passioTransit/gtfs/realtime/vehiclePositions.json");
        const buses = await response.json();

        active_trip_ids = new Set();
        active_shape_to_route = new Map();
        buses.entity.forEach(bus => {
            // const { x, y } = mapCoord(bus.vehicle.position.latitude, bus.vehicle.position.longitude);
            active_shape_to_route.set(tripsMap.get(bus.vehicle.trip.trip_id).shape_id, tripsMap.get(bus.vehicle.trip.trip_id).route_id);
            active_trip_ids.add(bus.vehicle.trip.trip_id);
            // push();
            // fill("#" + routes[tripsMap.get(bus.vehicle.trip.trip_id).route_id][1]);
            // // ellipse(x, y, 20);
            // pop();
        })

       
    }

    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;

    // function mapCoord(lat, lon) {
    //     return {
    //         x: map(lon, minLon, maxLon, width / 2 + 50, 50),
    //         y: map(lat, minLat, maxLat, height / 2 + 50, 50)
    //     };
    // }

    async function getVehiclePositions() {
        const currentTime = Date.now() / 1000; // Current time in seconds

        const response2 = await fetch("https://passio3.com/harvard/passioTransit/gtfs/realtime/tripUpdates.json");
        let apiResponse = await response2.json();

        const vehiclePositions = [];

        for (const entity of apiResponse.entity) {
            const tripUpdate = entity.trip_update;
            const stopTimeUpdates = tripUpdate.stop_time_update;

            // Sort the stop_time_update array by arrival time in ascending order
            stopTimeUpdates.sort((a, b) => a.arrival.time - b.arrival.time);

            let currentStop, prevStop;

            // Find the current and previous stops
            for (let i = 0; i < stopTimeUpdates.length; i++) {
            const stop = stopTimeUpdates[i];
            if (stop.arrival.time > currentTime) {
                currentStop = stop;
                prevStop = stopTimeUpdates[i - 1];
                break;
            }
            }

            if (currentStop && prevStop) {
            const prevStopArrivalTime = prevStop.arrival.time;
            const currentStopArrivalTime = currentStop.arrival.time;
            const timeSincePrevStop = currentTime - prevStopArrivalTime;
            const totalTravelTime = currentStopArrivalTime - prevStopArrivalTime;
            const percentage = timeSincePrevStop / totalTravelTime;

            vehiclePositions.push({
                tripId: tripUpdate.trip.trip_id,
                prevStopId: prevStop.stop_id,
                currentStopId: currentStop.stop_id,
                percentage,
            });
            }
        }

        return vehiclePositions;
    }
    


	onMount(() => {
        load_data();
	});

    async function load_data() {
        let result = await prepare_data();
        stops = result[0]; // stops data (stop_id, stop_name, x, y)
        shapes = result[1]; // shapes data (shape_id, shape_pt_lat, shape_pt_lon)
        tripsMap = result[2]; // trips map (trip_id -> { shape_id, route_id })
        stopTimesMap = result[3]; // stop times map (trip_id -> [[stop_id, stop_sequence, arrival_time, departure_time], ...])
        await draw_buses();
        vehiclePositions = await getVehiclePositions();
        console.log(vehiclePositions);
        redraw();
    }

    function redraw() {

        // determine width & height of parent element and subtract the margin
        let width = 800;
        let height = 1000;

        // init scales according to new width & height
        let xScale = d3.scaleLinear().domain([0, 10]);
        let yScale = d3.scaleLinear().domain([0, 10]);
		xScale.range([0, width]);
		yScale.range([height, 0]);
        // create svg and create a group inside that is moved by means of margin
		const svg = d3.select(el)
			.append('svg')
			.attr('width', width + margin.left + margin.right)
			.attr('height', height + margin.top + margin.bottom)
			.append('g')
			.attr('transform', `translate(${[margin.left, margin.top]})`)

        let y = 20;
        svg.append("text")
            .attr("x", 10)
            .attr("y", 10)
            .attr("fill", "black")
            .style("font-size", "16px")
            .style("font-weight", "bold")
            .text("Active Routes");

        active_trip_ids.forEach(trip_id => {
            const shapeId = tripsMap.get(trip_id).shape_id;
            const routeData = routes[active_shape_to_route.get(shapeId)];
            const routeColor = "#" + routeData[1];
            const routeName = routeData[0];

            const circle = svg.append("g")
                .attr("transform", `translate(20, ${y + 20})`);

            circle.append("circle")
                .attr("r", 10)
                .attr("fill", routeColor);

            circle.append("text")
                .attr("x", 20)
                .attr("y", 5)
                .attr("fill", "black")
                .style("font-size", "16px")
                .text(routeName);

            y += 30;
        });

    }
</script>

<main>
	<h1>Project Output</h1>
	<div id="vis" bind:this={el}></div>
</main>

<style>
	main {
		height: 100%;
		display: flex;
	}
	
	#vis {
		width: 100%;
		height: 100%;
		background-color: whitesmoke;
	}
	
	circle {
		fill: black;
		fill-opacity: 0.5;
	}
</style>

