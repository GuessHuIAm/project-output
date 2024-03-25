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

    let num_routes_clicked = 0;

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
                const minutesTillNextStop = Math.floor(
                    (currentStopArrivalTime - currentTime) / 60,
                );

                vehicle_positions.push({
                    x: 0,
                    y: 0,
                    tripId: tripUpdate.trip.trip_id,
                    prevStopId: prevStop.stop_id,
                    currentStopId: currentStop.stop_id,
                    minutesTillNextStop,
                    percentage,
                });
            }
        }

        for (const vehicle of vehicle_positions) {
            const trip_id = vehicle.tripId;
            const shapeId = tripsMap.get(trip_id).shape_id;
            const routeData = routes[active_shape_to_route.get(shapeId)];
            if (!routeData) {
                console.log(shapeId + " not found");
                continue;
            }
            const routeName = routeData[0];

            const segment = get_route_segment(routeName, vehicle.prevStopId);

            const seg = segment.node();
            if (!seg) continue;

            // const isPolyline = seg.tagName.toLowerCase() === "polyline";

            // let polylinePointsArray;

            // if (isPolyline) {
            //     const polylinePoints = d3.select(seg).attr("points");
            //     const coordinatePairs = polylinePoints.split(/\s+/);
            //     polylinePointsArray = coordinatePairs.flatMap((pair) =>
            //         pair.split(",").map(parseFloat),
            //     );
            //     const busPosition = getPointAtPercentage(
            //         polylinePointsArray,
            //         vehicle.percentage,
            //     );
            //     vehicle.x = busPosition.x;
            //     vehicle.y = busPosition.y;
            // } else {
            //     // Segment is a line
            //     const x1 = parseFloat(d3.select(seg).attr("x1"));
            //     const y1 = parseFloat(d3.select(seg).attr("y1"));
            //     const x2 = parseFloat(d3.select(seg).attr("x2"));
            //     const y2 = parseFloat(d3.select(seg).attr("y2"));
            //     polylinePointsArray = [x1, y1, x2, y2];
            //     const busPosition = getBusPositionFromLine(
            //         polylinePointsArray,
            //         vehicle.percentage,
            //     );
            //     vehicle.x = busPosition.x;
            //     vehicle.y = busPosition.y;
            // }
        }

        return vehicle_positions;
    }

    function getPointAtPercentage(polyline, percentage) {
        // Helper function to get the distance between two points
        const getDistance = (pointA, pointB) => {
            return Math.sqrt(
                Math.pow(pointB.x - pointA.x, 2) +
                    Math.pow(pointB.y - pointA.y, 2),
            );
        };

        // Calculate the total length of the polyline
        let totalLength = 0;
        for (let i = 0; i < polyline.length - 1; i++) {
            totalLength += getDistance(polyline[i], polyline[i + 1]);
        }

        // Target length is the percentage of the total length
        let targetLength = totalLength * (percentage / 100);

        // Find the point at the target length
        let accumulatedLength = 0;
        for (let i = 0; i < polyline.length - 1; i++) {
            const segmentLength = getDistance(polyline[i], polyline[i + 1]);
            if (accumulatedLength + segmentLength >= targetLength) {
                // Found the segment that contains the point
                const remainingLength = targetLength - accumulatedLength;
                const ratio = remainingLength / segmentLength;

                // Calculate the point's coordinates on the segment
                const point = {
                    x:
                        polyline[i].x +
                        ratio * (polyline[i + 1].x - polyline[i].x),
                    y:
                        polyline[i].y +
                        ratio * (polyline[i + 1].y - polyline[i].y),
                };

                return point;
            }
            accumulatedLength += segmentLength;
        }

        // If the polyline is degenerate or the percentage is out of bounds, handle accordingly
        // For this example, return the last point if percentage is >= 100
        return polyline[polyline.length - 1];
    }

    function getBusPositionFromLine(polylinePoints, percentage) {
        const dx = polylinePoints[2] - polylinePoints[0];
        const dy = polylinePoints[3] - polylinePoints[1];

        const newX = polylinePoints[0] - dx * percentage;
        const newY = polylinePoints[1] - dy * percentage;

        return { x: newX, y: newY };
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
        update_svg();
        vehicle_positions = await get_vehicle_positions();
        console.log(vehicle_positions);
        //draw_buses();
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
                    const prevStopName = stopsMap.get(
                        vehicle.prevStopId,
                    ).stop_name;
                    const currentStopName = stopsMap.get(
                        vehicle.currentStopId,
                    ).stop_name;
                    const minutesTillNextStop = vehicle.minutesTillNextStop;
                    const p = document.createElement("p");
                    p.innerText = `${prevStopName} -> ${currentStopName} (arriving in ${minutesTillNextStop} minutes)`;
                    p.onmouseover = function () {
                        const segment = get_route_segment(
                            routeName,
                            vehicle.prevStopId,
                        );
                        console.log(segment.node());
                        segment.style("stroke", `#${color}`);
                    };
                    p.onmouseout = function () {
                        const segment = get_route_segment(
                            routeName,
                            vehicle.prevStopId,
                        );
                        segment.style("stroke", null);
                    };
                    toggle_container.appendChild(p);
                }
            });

            div.appendChild(toggle_container);
            div.onmouseover = function () {
                mouseover_route(routeName, true);
            };
            div.onmouseout = function () {
                mouseout_route(true);
            };
            div.onclick = function () {
                route_click(this, routeName);
            };
            div.id = encode_name(routeName) + "-panel";
            panelInfo.appendChild(div);
        });
    }

    async function update_arrivals(stop) {
        // const arrivals = stopTimesMap.get(stop.stop_id);
        const panel = document.getElementById("arrivals-panel");
        panel.innerHTML = stop.stop_name;

        const response2 = await fetch(
            "https://passio3.com/harvard/passioTransit/gtfs/realtime/tripUpdates.json",
        );
        let apiResponse = await response2.json();

        const times = [];

        for (const entity of apiResponse.entity) {
            // search for all entities that have this stop
            const trip_id = entity.trip_update.trip.trip_id;
            const stopTimes = entity.trip_update.stop_time_update;
            const stopInfo = stopTimes.find(
                (stopTime) => stopTime.stop_id === stop.stop_id,
            );
            if (stopInfo) {
                times.push([stopInfo, trip_id]);
            }
        }

        times.sort((a, b) => a[0].arrival.time - b[0].arrival.time);

        let count = 0;

        times.forEach((time) => {
            // Get the current time in seconds
            var currentTimeInSeconds = Math.floor(Date.now() / 1000);

            // Calculate the time difference in seconds
            var timeDifferenceInSeconds =
                time[0].arrival.time - currentTimeInSeconds;

            if (timeDifferenceInSeconds < 0) {
                return;
            }
            count++;
            const trip_id = time[1];
            const routeData = routes[tripsMap.get(trip_id).route_id];
            const routeName = routeData[0];
            const color = routeData[1];
            const div = document.createElement("div");
            div.classList.add("route-panel");
            div.style.border = `5px solid #${color}`;
            div.innerText = routeName;
            // add arrival time in terms of minutes from now

            // Convert seconds to minutes
            var minutesUntilArrival = Math.floor(timeDifferenceInSeconds / 60);

            const p = document.createElement("p");
            p.innerText = `in ${minutesUntilArrival} - ${minutesUntilArrival + 3} minutes`;
            div.appendChild(p);
            // div.innerText += ` - ${minutesUntilArrival} minutes`;
            panel.appendChild(div);
        });

        if (count === 0) {
            const div = document.createElement("div");
            div.classList.add("route-panel");
            div.innerText = "No upcoming arrivals";
            panel.appendChild(div);
        }

        console.log(times);
    }

    function route_click(target, route_name) {
        // If it's clicked, add the clicked class
        if (target.classList.contains("clicked")) {
            num_routes_clicked--;

            d3.select(`#${encode_name(route_name)}-panel`)
                .classed("clicked", false)
                .style("background-color", "transparent");

            d3.select(`#${encode_name(route_name)}`)
                .classed("clicked", false);

            if (num_routes_clicked === 0) {
                d3.selectAll(".active-route").style("display", "");
            } else {
                d3.selectAll(".active-route")
                    .filter(function () {
                        return !this.classList.contains("clicked");
                    })
                    .style("display", "none");
            }
        } else {
            num_routes_clicked++;
            
            let borderColor = d3.select(`#${encode_name(route_name)}-panel`).node().style.borderColor;
            d3.select(`#${encode_name(route_name)}-panel`)
                .classed("clicked", true)
                .style("background-color", borderColor);
            
            d3.select(`#${encode_name(route_name)}`)
                .classed("clicked", true)
                .style("display", "");
            d3.selectAll(".active-route")
                .filter(function () {
                    return !this.classList.contains("clicked");
                })
                .style("display", "none");
        }
    }

    let show_inactive_routes = true;
    function toggle_inactive_routes() {
        if (show_inactive_routes) {
            d3.selectAll(".inactive-route").style("display", "");
        } else {
            d3.selectAll(".inactive-route").style("display", "none");
        }
    }

    function get_route_segment(route_name, start_stop_id) {
        let svg = d3.select(svgMap).select("svg");
        let route = svg.select(`#${encode_name(route_name)}`);

        let route_segments = route.selectAll("polyline, line");

        // Grab the polyline or line whose id starts with encode_name(start_stop_id)
        let segment = route_segments.filter(function () {
            return this.id.startsWith(encode_name(start_stop_id));
        });

        return segment;
    }

    function draw_buses() {
        let svg = d3.select(svgMap).select("svg");
        let g = svg.append("g");

        vehicle_positions.forEach((vehicle) => {
            if (vehicle.x === 0 || vehicle.y === 0) return;
            const trip_id = vehicle.tripId;
            const shapeId = tripsMap.get(trip_id).shape_id;
            const routeData = routes[active_shape_to_route.get(shapeId)];
            const routeName = routeData[0];
            const color = routeData[1];
            g.append("rect")
                .attr("x", vehicle.x)
                .attr("y", vehicle.y)
                .attr("width", 10)
                .attr("height", 20)
                .attr("fill", "#" + color)
                .attr("stroke", "black");
        });
    }

    function mouseover_route(route_name, is_active_route) {
        if (is_active_route) {
            if (num_routes_clicked === 0) {
                // Lower the opacity of other active routes
                d3.selectAll(".active-route")
                    .filter(function () {
                        return this.id !== encode_name(route_name);
                    })
                    .style("opacity", "0.3");
            }
        } else {
            // Highlight inactive routes
            d3.selectAll(".inactive-route").style("opacity", "");
            d3.selectAll(".inactive-route")
                .filter(function () {
                    return this.id === encode_name(route_name);
                })
                .style("opacity", "0.5");
        }
    }

    function mouseout_route(is_active_route) {
        if (is_active_route) {
            d3.selectAll(".active-route").style("opacity", "");
        } else {
            d3.selectAll(".inactive-route").style("opacity", "");
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
                .each(function () {
                    const routeG = d3.select(this);
                    const routeId = routeG.attr("id");

                    // Determine if the current route is active
                    const isActiveRoute = activeRouteNames.has(
                        nameMap.get(routeId),
                    );

                    // Common mouseover behavior
                    routeG.on("mouseover", function (event) {
                        mouseover_route(nameMap.get(routeId), isActiveRoute);
                        tooltip
                            .style("visibility", "visible")
                            .text(nameMap.get(routeId) + " (Route)");
                    });

                    // Common mousemove behavior
                    routeG.on("mousemove", function (event) {
                        tooltip
                            .style("top", event.pageY - 10 + "px")
                            .style("left", event.pageX + 10 + "px");
                    });

                    // Common mouseout behavior
                    routeG.on("mouseout", function () {
                        mouseout_route(isActiveRoute);
                        tooltip.style("visibility", "hidden");
                    });

                    // Additional styling based on active or inactive status
                    if (isActiveRoute) {
                        routeG
                            .style("display", "")
                            .classed("route active-route", true)
                            .on("click", function () {
                                route_click(this, nameMap.get(routeId));
                            });
                    } else {
                        routeG
                            .classed("inactive-route route", true)
                            .style("display", "")
                            .attr("opacity", "0.2")
                            .style("stroke", "#000000");
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
                        .text(
                            stopsMap.get(d3.select(this).attr("id")).stop_name +
                                " (Stop)",
                        );
                })
                .on("mousemove", function (event) {
                    tooltip
                        .style("top", event.pageY - 10 + "px")
                        .style("left", event.pageX + 10 + "px");
                })
                .on("mouseout", function () {
                    tooltip.style("visibility", "hidden");
                })
                .on("click", function () {
                    update_arrivals(stopsMap.get(d3.select(this).attr("id")));
                });

            //    draw_buses();
        });
    }
</script>

<main>
    <div class="side-panel">
        <h1>PassioWay</h1>
        Show Inactive Routes
        <div class="toggle-switch">
            <input
                type="checkbox"
                id="toggle-buses"
                name="toggle-buses"
                class="toggle-checkbox"
                bind:checked={show_inactive_routes}
                on:change={toggle_inactive_routes}
            />
            <label class="toggle-label" for="toggle-buses"></label>
        </div>
        <div id="panel-info" >
            <h2>Active Routes</h2>
            Click on a route to isolate it.
            <div bind:this={panelInfo}></div>
        </div>
    </div>
    <div id="vis" bind:this={svgMap}></div>
    <div class="side-panel">
        <h1>Arrivals</h1>
        <div id="arrivals-panel">
            Click on a stop to view upcoming arrivals.
        </div>
    </div>
</main>

<style>
    main {
        display: flex;
        height: 100%;
    }

    .side-panel {
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

    #panel-info,
    #arrivals-panel {
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
