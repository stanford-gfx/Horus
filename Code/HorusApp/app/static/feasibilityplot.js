var FeasibilityPlot = function(selector, xLabel, yLabel, w) {
	this.selector = selector;
	this.xLabel = xLabel;
	this.yLabel = yLabel;
	this.margin = {top: 20, right: 20, bottom: 30, left: 50},
	this.width = w - this.margin.left - this.margin.right;
	this.height = w * (9/16) - this.margin.top - this.margin.bottom;
	this.colors = ["rgb(158, 218, 229)",
            "rgb(219, 219, 141)", 
            "rgb(199, 199, 199)",
            "rgb(247, 182, 210)",
            "rgb(196, 156, 148)",
            "rgb(197, 176, 213)",
            "rgb(225, 122, 120)",
            "rgb(122, 193, 108)",
            "rgb(225, 157, 90)", 
            "rgb(144, 169, 202)",
            "rgb(109, 204, 218)", 
            "rgb(205, 204, 93)",
            "rgb(162, 162, 162)",
            "rgb(237, 151, 202)",
            "rgb(168, 120, 110)",
            "rgb(173, 139, 201)",
            "rgb(237, 102, 93)",
            "rgb(103, 191, 92)", 
            "rgb(255, 158, 74)",
            "rgb(114, 158, 206)",];
    this.colors.reverse();
	this._createLinePlot();
}

_.extend(FeasibilityPlot.prototype, {
	_createLinePlot: function() {
		this.x = d3.scale.linear()
			.range([0, this.width]);

		this.y = d3.scale.linear()
			.range([this.height, 0]);

		this.xAxis = d3.svg.axis()
		    .scale(this.x)
		    .ticks(0)
		    .orient("bottom");

		this.yAxis = d3.svg.axis()
		    .scale(this.y)
		    .ticks(0)
		    .orient("left");

		this.svg = d3.select(this.selector).append("svg")
				.attr("width", this.width + this.margin.left + this.margin.right)
				.attr("height", this.height + this.margin.top + this.margin.bottom)
			.append("g")
				.attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

		this.svg.append("g")
				.attr("class", "x axis")
				.attr("transform", "translate(0," + this.height + ")")
				.call(this.xAxis)
			.append("text")
				.attr("x", this.width/2)
				.attr("y", 30)
				.style("text-anchor", "end")
				.text(this.xLabel);

		console.log(this.xLabel);

		this.svg.append("g")
				.attr("class", "y axis")
				.call(this.yAxis)
			.append("text")
				.attr("transform", "rotate(-90)")
			    .attr("y", -30)
			    .attr("dy", ".71em")
			    .style("text-anchor", "end")
			    .text(this.yLabel);

		this.xLinesGroup = this.svg.append("svg:g")
				.attr("class", "x-lines-group");
	},

	setLimits: function(y_min, y_max, numTicks) {
		this.y.domain([y_min, y_max]);
		numTicks = numTicks || 10;
		this.yAxis.ticks(numTicks);

        this.svg.select(".y.axis")
            .call(this.yAxis);

	},

	setData: function(x_arr, y_arrs) {
		this.x.domain([x_arr[0], x_arr[x_arr.length - 1]]);
		this.xAxis.ticks(10);

		this.svg.select(".x.axis")
            .call(this.xAxis);

		var self = this;
		if (this.xLines) {
    		this.xLines.remove();
    	}

    	this.xLines = this.xLinesGroup.selectAll(".xline")
				.data(x_arr)
				.enter().append("svg:line")
				.attr("class", "xLine")
				.attr("x1", function(d) { return self.x(d) })
				.attr("x2", function(d) { return self.x(d) })
				.attr("y1", 0).attr("y2", this.height)

		var line = d3.svg.line()
    		.interpolate("linear")
    		.x(function(d, i) { return self.x(x_arr[i]); })
    		.y(this.y);

    	if (this.lines == undefined) {
    		this.lines = this.svg.selectAll(".line")
    			.data(y_arrs)
    		.enter().append("path")
    			.attr("class", "line")
    			.attr("d", line)
    			.style("stroke", function(d, i) { return self.colors[i]; });
    	} else {
    		this.lines
    			.data(y_arrs)
    			.attr("d", line);
    	}

	},
});