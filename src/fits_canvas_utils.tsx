export type FitsValue = string | boolean | number

export interface FitsHeader {
	NAXIS1: number,
	NAXIS2: number,
	BITPIX: number
	BZERO: number,
	BSCALE: number
	[key: string]: FitsValue
}

export const get_header = (fitsab: ArrayBuffer) => {

	// init header collections
	const header: Partial<FitsHeader> = {};
	const rawheader = [];

	// fill header from 80 byte cards blocked in units of 2880 bytes.
	let hlen = 0;
	try {

		const decoder = new TextDecoder('utf8')
		const u8 = new Uint8Array(fitsab, hlen, 80)
		for (hlen = 0; hlen < fitsab.byteLength; hlen += 80) {
			//@ts-ignore
			let card = String.fromCharCode.apply(null, new Uint8Array(fitsab, hlen, 80));
			if (card.match(/^END */)) {		// finished when see END
				hlen += 80;
				break;
			}

			rawheader.push(card);		// capture the raw card image

			if (card.indexOf("=") < 0)		// skip COMMENT, HISTORY etc
				continue;

			let key = card.substring(0, 8);	// key is always the first 8 chars ...
			key = key.replace(/ *$/, "");	// without trailing blanks

			let val: FitsValue = card.substring(10);	// value starts in col 11 but ...
			val = val.replace(/^ */, "");	// remove leading blanks
			val = val.replace(/\/.*$/, "");	// remove comments
			val = val.replace(/ *$/, "");	// remove trailing blanks
			if (val.indexOf("'") >= 0)		// looks like a string
				val = val.substring(1, val.length - 2);
			else if (val.indexOf("T") >= 0)	// looks like a True boolean
				val = true;
			else if (val.indexOf("F") >= 0)	// looks like a False boolean
				val = false;
			else if (val.indexOf(".") >= 0)	// looks like a float
				val = parseFloat(val);
			else				// must be an int
				val = parseInt(val);
			header[key] = val;
			// console.log (key + ": #" + header[key] + "#");
		}
	} catch (err) {
		throw ("file: not a FITS file: " + err);
	}

	return [header as FitsHeader, hlen as number] as [FitsHeader, number]
}

export const validate_new_image = function (
	header: FitsHeader,
	hlen: number,
) {
	// confirm minimal header
	if (!(header.SIMPLE
		&& typeof header.NAXIS1 == "number"
		&& typeof header.NAXIS2 == "number"
		&& typeof header.BITPIX == "number")) {
		throw ("file : not a valid FITS file");
	}

	// pixels start on next whole 2880 block
	if ((hlen % 2880) > 0)
		hlen += 2880 - (hlen % 2880);

	// confirm minimal header
	if (!(header.SIMPLE
		&& typeof header.NAXIS1 == "number"
		&& typeof header.NAXIS2 == "number"
		&& typeof header.BITPIX == "number")) {
		throw ("file: not a valid FITS file");
	}

}

export const set_new_image = (
	header: FitsHeader,
	hlen: number,
	fitsab: ArrayBuffer) => {
	// pixels start on next whole 2880 block
	if ((hlen % 2880) > 0)
		hlen += 2880 - (hlen % 2880);

	// save image size
	// console.log (this.header.NAXIS1 + " x " + this.header.NAXIS2 + " x " + this.header.BITPIX);
	const width: number = header.NAXIS1 as number;
	const height: number = header.NAXIS2 as number;
	var npixels = width * height;
	var nbytes = npixels * Math.abs(header.BITPIX as number) / 8;
	if (fitsab.byteLength < hlen + nbytes)
		throw ("file: too short: " + fitsab.byteLength + " < " + (hlen + nbytes));
	// console.log (npixels + " pixels in " + nbytes + " bytes");

	// convert remainder of file to an array of physical values, depending on type.
	// along the way also flip vertically.
	var bzero = header.BZERO || 0;
	var bscale = header.BSCALE || 1;
	let image = new Array<number>(npixels);
	var dv = new DataView(fitsab, hlen, nbytes);
	if (header.BITPIX == 8) {
		// data is array of unsigned bytes
		var imgi = 0;
		for (var y = 0; y < height; y++) {
			var fitsi = (height - 1 - y) * width;
			for (var x = 0; x < width; x++) {
				image[imgi] = bzero + bscale * dv.getUint8(fitsi);
				imgi++;
				fitsi++;
			}
		}
	} else if (header.BITPIX == 16) {
		// data is array of signed words, big endian
		var imgi = 0;
		for (var y = 0; y < height; y++) {
			var fitsi = (height - 1 - y) * width;
			for (var x = 0; x < width; x++) {
				image[imgi] = bzero + bscale * dv.getInt16(fitsi * 2, false);
				imgi++;
				fitsi++;
			}
		}
	} else if (header.BITPIX == 32) {
		// data are array of signed double words, big endian
		var imgi = 0;
		for (var y = 0; y < height; y++) {
			var fitsi = (height - 1 - y) * width;
			for (var x = 0; x < width; x++) {
				image[imgi] = bzero + bscale * dv.getInt32(fitsi * 4, false);
				imgi++;
				fitsi++;
			}
		}
	} else if (header.BITPIX == -32) {
		// data are array of IEEE single precising floating point, big endian
		var imgi = 0;
		for (var y = 0; y < height; y++) {
			var fitsi = (height - 1 - y) * width;
			for (var x = 0; x < width; x++) {
				image[imgi] = bzero + bscale * dv.getFloat32(fitsi * 4, false);
				imgi++;
				fitsi++;
			}
		}
	} else {
		throw ("file: BITPIX " + header.BITPIX + " is not yet supported");
	}

	return image
}


const fits_new_canvas = (parent: HTMLElement, name: string, z: number) => {
	//todo: make react component 
	var cid = document.createElement("canvas");
	cid.setAttribute("id", name);

	cid.setAttribute("style", "position:absolute; z-index:" + z);
	cid.setAttribute("width", parent.style.width);
	cid.setAttribute("height", parent.style.height);
	parent.appendChild(cid);

	return (cid);
}

/* render the given ROI and invoke userROIChangedHandler, if any, with redef
 */

/* clear the given canvas context
 */
export const clear_layer = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
	// ctx is already scaled to accept image coords
	ctx.clearRect(0, 0, width, height);
}


export const no_smoothing = (ctx: CanvasRenderingContext2D) => {
	ctx.imageSmoothingEnabled = false;
	// ctx.mozImageSmoothingEnabled = false;
}

/* return black white pixel values given contrast and stats.
 */
export const find_black_and_white = (contrast: number, stats: any) => {
	if (!stats)
		return { black: 255, white: 0 };

	const black = Math.max(stats.min, stats.mean - 6 * stats.stddev * (1 - contrast));
	const white = Math.min(stats.max, stats.mean + 6 * stats.stddev * (1 - contrast));

	return {
		black: black,
		white: white
	};

}

/* compute some image stats at the given ROI.
 * ROI must have x, y, width and height.
 * object returned will have at least properties npixels, min, max, sum, mean, stddev and histo.
 * throw if ROI is not wholly contained with in the image.
 */
export const compute_roi_stats = (
	parentWidth: number,
	parentHeight: number,
	width: number,
	height: number,
	x: number,
	y: number,
	image: Array<number>) => {
	if (!image)
		return;

	console.log(x + " " + y + " " + width + " " + height, parentWidth, parentHeight);
	if (x < 0 || width < 0 || x + width > parentWidth
		|| y < 0 || height < 0 || y + height > parentHeight)
		console.log("file: roi is outside image [" + x + "," + y + "], "
			+ width + " x " + height);

	// scan pixels within roi
	var npixels = width * height;
	var pxi = y * parentWidth + x;		// start of first row in roi
	var min = image[pxi];
	var max = min;
	var maxatx = x, maxaty = y;
	var minatx = x, minaty = y;
	var sum = 0;
	var sum2 = 0;
	for (var dy = 0; dy < height; dy++) {
		for (var dx = 0; dx < width; dx++) {
			var p = image[pxi++];
			if (p < min) {
				min = p;
				minatx = dx + x;
				minaty = dy + y;
			}
			if (p > max) {
				max = p;
				maxatx = dx + x;
				maxaty = dy + y;
			}
			if (p) {
				sum += p;
				sum2 += p * p;
			}
		}
		pxi += (parentWidth - width);	// skip to start of next row
	}

	console.log('min', min, 'max', max, 'pxi', pxi)
	var range = Math.max(1, max - min);
	var stddev = Math.sqrt(npixels * sum2 - sum * sum) / npixels;
	console.log('range', range, 'stddev', stddev)

	// init histogram, index N bins as [0..N-1] for pixel values [min..max].
	// nothing critical about N.
	var histo = new Array(128);
	for (var i = 0; i < histo.length; i++)
		histo[i] = 0;

	// use pixel range to rescan for histogram
	pxi = y * parentWidth + x;		// start of first row in roi
	var histomax = 0;				// n counts in largest bin
	for (var dy = 0; dy < height; dy++) {
		for (var dx = 0; dx < width; dx++) {
			var p = image[pxi++];
			var bin = Math.floor((histo.length - 1) * (p - min) / range);
			if (++histo[bin] > histomax)
				histomax = histo[bin];
		}
		pxi += (parentWidth - width);	// skip to start of next row
	}

	// find median: pixel at which half are below and half above
	var histi = 0;
	for (var count = 0; count < npixels / 2; histi++)
		count += histo[histi];
	var median = Math.floor(min + range * histi / histo.length);
	// console.log ('median = ' + median);

	// return the stats report
	return {
		npixels: npixels,			// n pixels in this roi
		min: min,				// smallest pixel in this roi
		minat: {
			x: minatx,			// location of smallest pixel
			y: minaty
		},
		max: max,				// largest pixel in this roi
		maxat: {
			x: maxatx,			// location of largest pixel
			y: maxaty
		},
		range: range,			// large of 1 and (max - min)
		sum: sum,				// sum of all pixels in this roi
		mean: sum / npixels,			// average of all pixels in this roi
		median: median,			// median of all pixels in this roi
		stddev: stddev,			// stddev of all pixels in this roi
		histo: histo,			// histogram, count of min .. max in length bins
		histomax: histomax,			// greatest count in histo, used for scaling
	};
}

export const event2coords = (event: MouseEvent, canvas: HTMLCanvasElement, resizeScale: number) => {
	//convert an event to its image coords
	var imgcoords = { x: 0, y: 0 };

	// get raw coords, depending on browser
	if (event.pageX) {
		imgcoords.x = event.pageX;
		imgcoords.y = event.pageY;
	} else {
		imgcoords.x = event.clientX;
		imgcoords.y = event.clientY;
	}
	// account for browser window scrolling (not the div scrolling)
	var iid_rect = canvas.getBoundingClientRect();
	imgcoords.x -= (window.pageXOffset + iid_rect.left);
	imgcoords.y -= (window.pageYOffset + iid_rect.top);
	// now account for user resizing and drop to nearest whole pixel
	imgcoords.x = Math.floor(imgcoords.x / resizeScale);
	imgcoords.y = Math.floor(imgcoords.y / resizeScale);

	return (imgcoords);
}

export const image2FITS = function (imageloc: any, height: number) {
	//convert image coords to fits coords. 
	var fitsloc = { ...imageloc };
	fitsloc.x = imageloc.x + 1;
	fitsloc.y = height - imageloc.y;
	if (imageloc.height)
		fitsloc.y -= (imageloc.height - 1);		// exclusive
	return (fitsloc);
}