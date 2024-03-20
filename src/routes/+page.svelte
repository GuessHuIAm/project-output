<script>
    import { onMount } from "svelte";
    import * as d3 from "d3";

    let data = [];
    let routes = {
        777: ["1636'er", "0099FF"],
        778: ["Allston Loop", "A50606"],
        779: ["Barry's Corner", "98DF8A"],
        782: ["Commencement/Class Day Quad", "2CA02C"],
        783: ["Crimson Cruiser", "DB0DD7"],
        3681: ["Harvard Square SEC Summer", "9467BD"],
        2021: ["HUIT Route", "F4EC07"],
        781: ["Inauguration Day", "2C4096"],
        786: ["Kennedy School Charter AM", "2C4096"],
        787: ["Kennedy School Charter PM", "2C4096"],
        788: ["Mather Crimson Overnight", "2C4096"],
        789: ["Mather Express", "0000FF"],
        785: ["Overnight", "FF8707"],
        790: ["Quad Express", "136D1C"],
        2235: ["Quad SEC Direct", "9467BD"],
        791: ["Quad Stadium Direct", "14EB27"],
        792: ["Quad Stadium Express", "50BC48"],
        793: ["Quad Yard Express", "006600"],
        5707: ["SEC Express", "FDAE6B"],
        3679: ["Summer Schedule", "136D1C"],
        3680: ["Summer School Overnight", "DB0DD7"],
        2654: ["Thanksgiving Day", "3", "E14E00"],
    };

    for (let i = 0; i < 100; ++i) {
        data.push({
            x: Math.random() * 10,
            y: Math.random() * 10,
        });
    }

    let svgMap, panelInfo;

    let stops = null;
    let shapes = null;

    let stopsMap = null;
    let tripsMap = null;
    let stopTimesMap = null;
    let vehicle_positions = null;

    let routes_node = null;
    let stops_node = null;

    const margin = {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
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
        const stopsData = await getFileAsObject("./data/stop_positions.csv");
        const stops = JSON.parse(stopsData);
        stops.forEach((stop) => {
            stop.x = parseFloat(stop.x);
            stop.y = parseFloat(stop.y);
        });
        const stopsMap = new Map();
        stops.forEach((stop) => {
            stopsMap.set(stop.stop_id, stop);
        });

        const shapesData = await getFileAsObject("./data/shapes.txt");
        const shapes = JSON.parse(shapesData);

        const tripsData = await getFileAsObject("./data/trips.txt");
        const trips = JSON.parse(tripsData);
        const tripsMap = new Map();

        const stopTimesData = await getFileAsObject("./data/stop_times.txt");
        const stopTimes = JSON.parse(stopTimesData);
        const stopTimesMap = new Map();

        trips.forEach((trip) => {
            tripsMap.set(trip.trip_id, {
                shape_id: trip.shape_id,
                route_id: trip.route_id,
            });
            all_trip_ids.add(trip.trip_id);
        });

        stopTimes.forEach((stopTime) => {
            if (stopTimesMap.has(stopTime.trip_id)) {
                stopTimesMap.get(stopTime.trip_id).stopInfo.push(stopTime);
            } else {
                stopTimesMap.set(stopTime.trip_id, { stopInfo: [stopTime] });
            }
        });

        shapes.forEach((shape) => {
            if (shape.shape_pt_lat < minLat) minLat = shape.shape_pt_lat;
            if (shape.shape_pt_lat > maxLat) maxLat = shape.shape_pt_lat;
            if (shape.shape_pt_lon < minLon) minLon = shape.shape_pt_lon;
            if (shape.shape_pt_lon > maxLon) maxLon = shape.shape_pt_lon;
        });

        return [stops, shapes, stopsMap, tripsMap, stopTimesMap];
    }

    let active_shape_to_route, active_trip_ids;
    let active_bus_locations;
    async function update_buses() {
        const response = await fetch(
            "https://passio3.com/harvard/passioTransit/gtfs/realtime/vehiclePositions.json",
        );
        const buses = await response.json();

        active_trip_ids = new Set();
        active_shape_to_route = new Map();
        buses.entity.forEach((bus) => {
            // const { x, y } = mapCoord(bus.vehicle.position.latitude, bus.vehicle.position.longitude);
            if (tripsMap.get(bus.vehicle.trip.trip_id) === undefined) return;
            active_shape_to_route.set(
                tripsMap.get(bus.vehicle.trip.trip_id).shape_id,
                tripsMap.get(bus.vehicle.trip.trip_id).route_id,
            );
            active_trip_ids.add(bus.vehicle.trip.trip_id);
            // push();
            // fill("#" + routes[tripsMap.get(bus.vehicle.trip.trip_id).route_id][1]);
            // // ellipse(x, y, 20);
            // pop();
        });
    }

    let minLat = Infinity,
        maxLat = -Infinity,
        minLon = Infinity,
        maxLon = -Infinity;

    // function mapCoord(lat, lon) {
    //     return {
    //         x: map(lon, minLon, maxLon, width / 2 + 50, 50),
    //         y: map(lat, minLat, maxLat, height / 2 + 50, 50)
    //     };
    // }

    async function get_vehicle_positions() {
        const currentTime = Date.now() / 1000; // Current time in seconds

        const response2 = await fetch(
            "https://passio3.com/harvard/passioTransit/gtfs/realtime/tripUpdates.json",
        );
        let apiResponse = await response2.json();

        const vehicle_positions = [];

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
                const totalTravelTime =
                    currentStopArrivalTime - prevStopArrivalTime;
                const percentage = timeSincePrevStop / totalTravelTime;

                vehicle_positions.push({
                    tripId: tripUpdate.trip.trip_id,
                    prevStopId: prevStop.stop_id,
                    currentStopId: currentStop.stop_id,
                    percentage,
                });
            }
        }

        return vehicle_positions;
    }

    onMount(() => {
        load_data();
    });

    async function load_data() {
        let result = await prepare_data();
        stops = result[0]; // stops data (stop_id, stop_name, x, y)
        shapes = result[1]; // shapes data (shape_id, shape_pt_lat, shape_pt_lon)
        stopsMap = result[2]; // stops map (stop_id -> { stop_name, x, y })
        tripsMap = result[3]; // trips map (trip_id -> { shape_id, route_id })
        stopTimesMap = result[4]; // stop times map (trip_id -> [[stop_id, stop_sequence, arrival_time, departure_time], ...])
        await update_buses();
        vehicle_positions = await get_vehicle_positions();
        console.log(vehicle_positions);
        update_svg();
        update_side_panel();
    }

    function encode_name(name) {
        return name
            .split("")
            .map((char, index) => {
                const isFirstChar = index === 0;
                const isAlpha =
                    (char >= "A" && char <= "Z") ||
                    (char >= "a" && char <= "z");
                const isDigit = char >= "0" && char <= "9";
                const isUnderscore = char === "_";
                const isSpace = char === " ";

                if (isSpace) return "_";
                if (
                    (isFirstChar && (isAlpha || isUnderscore)) ||
                    (!isFirstChar && (isAlpha || isDigit || isUnderscore))
                ) {
                    return char; // Return the character itself if it's allowed
                } else {
                    return `_x${char.charCodeAt(0).toString(16)}_`; // Encode in hexadecimal
                }
            })
            .join("");
    }

    function update_side_panel() {
        let route_names = new Set();

        d3.select(panelInfo)
            .append("text")
            .attr("x", 10)
            .attr("y", 15)
            .attr("fill", "black")
            .style("font-size", "20px")
            .style("font-weight", "bold")
            .text("Active Routes");

        active_trip_ids.forEach((trip_id) => {
            const shapeId = tripsMap.get(trip_id).shape_id;
            const routeData = routes[active_shape_to_route.get(shapeId)];
            const routeName = routeData[0];
            if (route_names.has(routeName)) return;
            route_names.add(routeName);
            const color = routeData[1];

            const div = document.createElement("div");
            div.id = encode_name(routeName) + "-panel";
            div.classList.add("route-panel");
            div.style.border = `5px solid #${color}`;
            div.innerText = routeName;
            div.appendChild(document.createElement("label"));

            const toggle_container = document.createElement("div");
            toggle_container.classList.add("toggle-container");
            vehicle_positions.forEach((vehicle) => {
                if (vehicle.tripId === trip_id) {
                    const stopTimes = stopTimesMap.get(trip_id).stopInfo;
                    const prevStop = stopTimes.find(
                        (stop) => stop.stop_id === vehicle.prevStopId,
                    );
                    const currentStop = stopTimes.find(
                        (stop) => stop.stop_id === vehicle.currentStopId,
                    );
                    const prevStopName = stopsMap.get(vehicle.prevStopId).stop_name;
                    const currentStopName = stopsMap.get(vehicle.currentStopId).stop_name;
                    const percentage = vehicle.percentage;
                    const p = document.createElement("p");
                    p.innerText = `${prevStopName} -> ${currentStopName} (${Math.round(
                        percentage * 100,
                    )}%)`;
                    toggle_container.appendChild(p);
                }
            });
            
            div.appendChild(toggle_container);
            div.onmouseover = function () {
                routes_node
                    .select(`#${encode_name(routeName)}`)
                    .style("opacity", "0.5");
            };
            div.onmouseout = function () {
                routes_node
                    .select(`#${encode_name(routeName)}`)
                    .style("opacity", null);
                    
            };
            div.onclick = function () {
                toggle_panel(this);
            };
            panelInfo.appendChild(div);
        });
    }

    function toggle_panel(route_panel) {
        const toggle_container = route_panel.querySelector(".toggle-container");
        const toggle_label = route_panel.querySelector("label");
        if (toggle_container.style.display === "none") {
            toggle_container.style.display = "block";
            toggle_label.textContent = " (Hide)";
        } else {
            toggle_container.style.display = "none";
            const num_vehicles = toggle_container.children.length;
            toggle_label.textContent = " (Show " + num_vehicles + " shuttle" + (num_vehicles > 1 ? "s" : "") + ")";
        }
    }

    function update_svg() {
        let width = window.innerHeight;
        let height = width;

        let xScale = d3.scaleLinear().domain([0, 10]).range([0, width]);
        let yScale = d3.scaleLinear().domain([0, 10]).range([height, 0]);

        const svg = d3
            .select(svgMap)
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left}, ${margin.top})`);

        const tooltip = d3
            .select("body")
            .append("div")
            .attr("class", "tooltip") // Ensure you have this class styled in your CSS
            .style("position", "absolute")
            .style("z-index", "10")
            .style("visibility", "hidden")
            .style("background", "#fff")
            .style("border", "1px solid #000")
            .style("border-radius", "5px")
            .style("padding", "10px")
            .text("a simple tooltip");

        const nameMap = new Map();
        for (const [routeId, [routeName, color]] of Object.entries(routes)) {
            nameMap.set(encode_name(routeName), routeName);
        }

        const stopsMap = new Map();
        stops.forEach((stop) => {
            stopsMap.set(encode_name(stop.stop_id), stop);
        });

        d3.xml("subway.svg").then((data) => {
            svg.node().append(data.documentElement);

            const activeRouteNames = new Set(
                Array.from(active_trip_ids).map((trip_id) => {
                    const shapeId = tripsMap.get(trip_id).shape_id;
                    const routeData =
                        routes[active_shape_to_route.get(shapeId)];
                    return routeData[0];
                }),
            );

            routes_node = svg.select("#Routes");
            stops_node = svg.select("#Stops");

            routes_node
                .selectAll("g")
                .filter(function () {
                    return this.parentNode === routes_node.node();
                })
                .classed("route", true)
                .each(function () {
                    const routeG = d3.select(this);
                    const routeId = routeG.attr("id");
                    if (activeRouteNames.has(nameMap.get(routeId))) {
                        routeG.style("display", "");
                        routeG
                            .on("mouseover", function (event) {
                                tooltip
                                    .style("visibility", "visible")
                                    .text(
                                        nameMap.get(d3.select(this).attr("id")) + " (Route)",
                                    );
                            })
                            .on("mousemove", function (event) {
                                tooltip
                                    .style("top", event.pageY - 10 + "px")
                                    .style("left", event.pageX + 10 + "px");
                            })
                            .on("mouseout", function () {
                                tooltip.style("visibility", "hidden");
                            });
                    } else {
                        routeG.style("display", "").attr("opacity", "0.2");
                    }
                });

            stops_node
                .selectAll("g")
                .filter(function () {
                    return this.parentNode === stops_node.node();
                })
                .classed("stop", true)
                .on("mouseover", function (event) {
                    tooltip
                        .style("visibility", "visible")
                        .text(stopsMap.get(d3.select(this).attr("id")).stop_name + " (Stop)",
                        );
                })
                .on("mousemove", function (event) {
                    tooltip
                        .style("top", event.pageY - 10 + "px")
                        .style("left", event.pageX + 10 + "px");
                })
                .on("mouseout", function () {
                    tooltip.style("visibility", "hidden");
                });
        });
    }
</script>

<main>
    <div id="side-panel">
        <h1>PassioWay</h1>
        <div id="panel-info" bind:this={panelInfo}></div>
    </div>
    <div id="vis" bind:this={svgMap}></div>
</main>

<style>
    main {
        display: flex;
        height: 100%;
    }

    #side-panel {
        width: 20%;
        margin: 10px;
        max-height: 98vh;
        background-color: rgb(162, 220, 175);
        overflow-y: auto;
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    #panel-info {
        width: 90%;
    }

    #vis {
        width: 80%;
        margin: 10px;
        max-height: 98vh;
        border-radius: 10px;
        background-color: whitesmoke;
        overflow-x: auto;
        overflow-y: auto;
    }
</style>
