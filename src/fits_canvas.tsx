import React, { useState, useEffect, useRef } from 'react';
import {
    compute_roi_stats,
    get_header,
    validate_new_image,
    set_new_image,
    FitsHeader,
    find_black_and_white,
    clear_layer,
    no_smoothing,
    event2coords,
    image2FITS
} from './fits_canvas_utils'

interface Props {
    fitsAB: ArrayBuffer
    stretch: string,
    parentWidth: number
    parentHeight: number
    color: string
}


const FitsCanvas = (props: Props) => {

    const [xPos, setXPos] = useState(0);						// ul roi x, image coords
    const [yPos, setYPos] = useState(0);						// ul roi y, image coords
    const [contrast, setContrast] = useState(0)
    const [black, setBlack] = useState(0)
    const [white, setWhite] = useState(0)
    const [range, setRange] = useState(1)
    const [resizeScale, setResizeScale] = useState(0)


    const [header, hlen] = get_header(props.fitsAB)
    const [width, setWidth] = useState(header.NAXIS1)
    const [height, setHeight] = useState(header.NAXIS2)
    const [xypPos, setXYPPos] = useState({ x: undefined as unknown as number, y: undefined as unknown as number, p: undefined as unknown as number, gs: undefined as unknown as number })
    validate_new_image(header as FitsHeader, hlen as number)
    const image = set_new_image(header as FitsHeader, hlen as number, props.fitsAB)

    const style = { width: props.parentWidth, height: props.parentHeight }

    const canvasRef = useRef(null)

    // useEffect(() => {
    //     console.log('new buffer')
    //     const [header, hlen] = get_header(props.fitsAB)
    //     setWidth(header.NAXIS1)
    //     setHeight(header.NAXIS2)
    // }, [props.fitsAB])

    useEffect(() => {
        const canvas = canvasRef.current as any as HTMLCanvasElement
        const context = canvas.getContext('2d') as CanvasRenderingContext2D

        // canvas.addEventListener("dblclick", function (e) {

        // }, false);  // dblclick to zoom in at point, shift dblclick to zoom out.

        handle_resize(image, canvas, context)
    }, [props.stretch])

    useEffect(() => {
        console.log('black, white, range', black, white, range)
        const canvas = canvasRef.current as any as HTMLCanvasElement
        const context = canvas.getContext('2d') as CanvasRenderingContext2D
        const el = (evt: MouseEvent) => handle_mouse_event(evt, canvas, context)

        canvas.removeEventListener("mousemove", el)
        canvas.addEventListener("mousemove", el)
    }, [black, white, range])


    const handle_mouse_event = (e: MouseEvent, canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) => {
        const cRect = canvas.getBoundingClientRect();
        const canvasX = Math.round(e.clientX - cRect.left);
        const canvasY = Math.round(e.clientY - cRect.top);
        const grey = context.getImageData(canvasX, canvasY, 1, 1).data[0]
        let imageCoords = event2coords(e, canvas, resizeScale) // starts at top left of image
        let fitsCoords = image2FITS(imageCoords, height) // starts at bottom left of image (flips y axis)
        // console.log('imageCoords', imageCoords, 'fitsCoords', fitsCoords)
        const idx = imageCoords.y * (width) + imageCoords.x
        //  console.log('idx and image value', idx, image[idx])
        const pxl = image[idx]
        setXYPPos({ x: canvasX, y: canvasY, gs: grey, p: pxl })
    }

    // called when user resizes the div containing the canvases
    const handle_resize = (
        image: Array<number>,
        canvas: HTMLCanvasElement,
        context: CanvasRenderingContext2D,
    ) => {
        if (!image)
            return;

        // get current physical size of div, accommodate possible units suffix
        const divw = parseInt(canvas.style.width);
        const divh = parseInt(canvas.style.height);
        console.log('divw', divw, 'divh', divh)

        // resize canvas to match the div
        canvas.setAttribute("width", canvas.style.width);
        canvas.setAttribute("height", canvas.style.height);


        // establish size of canvas compared to size of image, maintaining aspect ratio
        if (divw / divh > width / height) {
            // full height
            var new_resize_scale = divh / height;
            setResizeScale(new_resize_scale)
        } else {
            // full width 
            var new_resize_scale = divw / width;
            setResizeScale(new_resize_scale)
        }
        // set scale so we can always work in image coords 
        console.log('scale', new_resize_scale)
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.translate(0.5, 0.5);		// crisper lines and pixels
        context.scale(new_resize_scale, new_resize_scale);
        render_all(context, new_resize_scale)
    }

    // (re)render everything, be prepared to adjust ROIs and glass sizes
    const render_all = (
        context: CanvasRenderingContext2D,
        resize_scale: number) => {
        // // adjust ROI back to a default location inside if it is now outside the image size
        let newXPos = xPos
        let newYPos = yPos
        let newWidth = width
        let newHeight = height
        console.log('img width', width, 'img height', height)
        // if (width > props.parentWidth - xPos) {
        //     newWidth = Math.floor(newWidth * resize_scale)
        //     newHeight = Math.floor(newHeight * resize_scale)
        // }
        // if (height > props.parentHeight - yPos) {
        //     newWidth = Math.floor(newWidth * resize_scale)
        //     newHeight = Math.floor(newHeight * resize_scale)
        // }
        // console.log('new img width', newWidth, 'new img height', newHeight)

        setXPos(newXPos);
        setYPos(newYPos);
        setWidth(newWidth);
        setHeight(newHeight);
        render_roi(image, context, newXPos, newYPos, newWidth, newHeight)
    }

    const render_roi = (
        image: Array<number>,
        context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {

        const stats = compute_roi_stats(
            props.parentWidth,
            props.parentHeight,
            w,
            h,
            x,
            y,
            image);
        // find black and white.
        const bw = find_black_and_white(contrast, stats);
        const r = Math.max(1, bw.white - bw.black);
        setBlack(bw.black)
        setWhite(bw.white);
        setRange(r)

        // handy
        // set up stretch option
        var stretch_f;
        if (props.stretch == "linear") {
            stretch_f = function (pixel: number) {
                return (255 * (pixel - bw.black) / r);
            }
        } else if (props.stretch == "square") {
            stretch_f = function (pixel: number) {
                var v = (pixel - bw.black) / r;
                return (255 * v * v);
            }
        } else if (props.stretch == "sqrt") {
            stretch_f = function (pixel: number) {
                return (255 * Math.sqrt((pixel - bw.black) / r));
            }
        } else {
            throw ("Unknown stretch: " + props.stretch + ", choices are linear, square and sqrt");
        }

        // render as gray scale from black to white, or all transparent if disabled
        var roiimage = new ImageData(w, h);
        var datai = 0;				// RGBA tuple index
        for (var ydx = y; ydx < y + h; ydx++) {
            for (var xdx = x; xdx < x + w; xdx++) {
                var p = image[ydx * w + xdx];
                var gray = stretch_f(p);
                roiimage.data[4 * datai] = gray;	// red
                roiimage.data[4 * datai + 1] = gray;	// green
                roiimage.data[4 * datai + 2] = gray;	// blue
                roiimage.data[4 * datai + 3] = 255;	// alpha
                datai++;
            }
        }

        // display it, must go through a temp canvas in order to use drawImage
        var tempcan = document.createElement("canvas");
        tempcan.width = w
        tempcan.height = h;
        var tcctx = tempcan.getContext("2d") as CanvasRenderingContext2D;
        tcctx.putImageData(roiimage, 0, 0);
        clear_layer(context, w, h);
        no_smoothing(context);
        context.drawImage(tempcan, x, y, width, height);	// resizes according to ctx
        // garbage collector will clean up tempcvs because it has no parent but give it a kick anyway
        //@ts-ignore
        tempcan = undefined;

    }

    return (
        // <text>{`x: ${xypPos.x}, y: ${xypPos.y}, greyScale: ${xypPos.gs}, value: ${xypPos.p}`}</text>
        <canvas
            id={'fits-viewer'}
            ref={canvasRef}
            style={style}
            width={width}
            height={height}
        />
    )

}

export default FitsCanvas