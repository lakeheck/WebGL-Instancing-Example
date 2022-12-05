import {config} from "./config.js"

export default function startGUI (config, initFramebuffers, updateKeywords) {
    const parName = 'Output Resolution';
    //dat is a library developed by Googles Data Team for building JS interfaces. Needs to be included in project directory 
    var gui = new dat.GUI({ width: 300 });

    gui.add(config, 'DISPLAY_FLUID').name('Render Fluid <> Vel Map');

    let fluidFolder = gui.addFolder('Fluid Settings');
    fluidFolder.add(config, 'DYE_RESOLUTION', { 'high': 1024, 'medium': 512, 'low': 256, 'very low': 128 }).name(parName).onFinishChange(initFramebuffers);
    fluidFolder.add(config, 'SIM_RESOLUTION', { '32': 32, '64': 64, '128': 128, '256': 256 }).name('Sim Resolution').onFinishChange(initFramebuffers);
    fluidFolder.add(config, 'DENSITY_DISSIPATION', 0, 4.0).name('Density Diffusion');
    fluidFolder.add(config, 'FLOW', 0, 0.5).name('Flow');
    fluidFolder.add(config, 'SPLAT_FLOW', 0, 1).name('Splat Flow');
    fluidFolder.add(config, 'VELOCITY_DISSIPATION', 0, 4.0).name('Velocity Diffusion');
    fluidFolder.add(config, 'VELOCITYSCALE', 0, 10.0).name('Velocity Scale');
    fluidFolder.add(config, 'PRESSURE', 0.0, 1.0).name('Pressure');
    fluidFolder.add(config, 'CURL', 0, 50).name('Vorticity').step(1);
    fluidFolder.add(config, 'SPLAT_RADIUS', 0.01, 1.0).name('Splat Radius');
    fluidFolder.add(config, 'SHADING').name('Shading').onFinishChange(updateKeywords);
    fluidFolder.add(config, 'PAUSED').name('Paused').listen();
    fluidFolder.add({ fun: () => {
        splatStack.push(parseInt(Math.random() * 20) + 5);
    } }, 'fun').name('Random splats');
    
    
    let mapFolder = gui.addFolder('Maps');
    mapFolder.add(config, 'FORCE_MAP_ENABLE').name('force map enable');
    mapFolder.add(config, 'DENSITY_MAP_ENABLE').name('density map enable'); //adding listen() will update the ui if the parameter value changes elsewhere in the program 
    // mapFolder.add(config, 'COLOR_MAP_ENABLE').name('color map enable');

    let noiseFolder = gui.addFolder('Velocity Map');
    noiseFolder.add(config, 'PERIOD', 0, 10.0).name('Period');
    noiseFolder.add(config, 'EXPONENT', 0, 4.0).name('Exponent');
    noiseFolder.add(config, 'RIDGE', 0, 1.5).name('Ridge');
    noiseFolder.add(config, 'AMP', 0, 4.0).name('Amplitude');
    noiseFolder.add(config, 'LACUNARITY', 0, 4).name('Lacunarity');
    noiseFolder.add(config, 'NOISE_TRANSLATE_SPEED', 0, 2).name('Noise Translate Speed');
    noiseFolder.add(config, 'GAIN', 0.0, 1.0).name('Gain');
    noiseFolder.add(config, 'OCTAVES', 0, 8).name('Octaves').step(1);
    noiseFolder.add(config, 'MONO').name('Mono');

    // let bloomFolder = gui.addFolder('Bloom');
    // bloomFolder.add(config, 'BLOOM').name('enabled').onFinishChange(updateKeywords);
    // bloomFolder.add(config, 'BLOOM_INTENSITY', 0.1, 2.0).name('intensity');
    // bloomFolder.add(config, 'BLOOM_THRESHOLD', 0.0, 1.0).name('threshold');

    let sunraysFolder = gui.addFolder('Sunrays');
    sunraysFolder.add(config, 'SUNRAYS').name('enabled').onFinishChange(updateKeywords);
    sunraysFolder.add(config, 'SUNRAYS_WEIGHT', 0.01, 1.0).name('weight');

    let captureFolder = gui.addFolder('Capture');
    captureFolder.addColor(config, 'BACK_COLOR').name('background color');
    captureFolder.add(config, 'TRANSPARENT').name('transparent');
    captureFolder.add({ fun: captureScreenshot }, 'fun').name('take screenshot');

    //create a function to assign to a button, here linking my github
    let github = gui.add({ fun : () => {
        window.open('https://github.com/lakeheck/Fluid-Simulation-WebGL');
        ga('send', 'event', 'link button', 'github');
    } }, 'fun').name('Github');
    github.__li.className = 'cr function bigFont';
    github.__li.style.borderLeft = '3px solid #8C8C8C';
    let githubIcon = document.createElement('span');
    github.domElement.parentElement.appendChild(githubIcon);
    githubIcon.className = 'icon github';

    if (isMobile())
        gui.close();

    gui.close();
    return gui;
}

function captureScreenshot () {
    let res = getResolution(config.CAPTURE_RESOLUTION);
    //use helper fxn to create frame buffer to render for screenshot 
    let target = createFBO(res.width, res.height, ext.formatRGBA.internalFormat, ext.formatRGBA.format, ext.halfFloatTexType, gl.NEAREST);
    render(target);

    //create a texture from the frame buffer 
    let texture = framebufferToTexture(target);
    texture = normalizeTexture(texture, target.width, target.height);

    let captureCanvas = textureToCanvas(texture, target.width, target.height);
    let datauri = captureCanvas.toDataURL();
    //use helper fxn to download data 
    downloadURI('fluid.png', datauri);
    //tell browser we can forget about this url
    URL.revokeObjectURL(datauri);
}

function framebufferToTexture (target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    let length = target.width * target.height * 4; //take length time width, and multiply by 4 since we have 4 channels (rgba)
    let texture = new Float32Array(length);
    //webgl fxn that will read pixels into a textue (texture type needs to match passed pixel data type, eg gl.FLOAT and Float32Array)
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.FLOAT, texture);
    return texture;
}


function isMobile () {
    return /Mobi|Android/i.test(navigator.userAgent);
}


//helper to rerange to integer values on [0,255] and return array of unsigned ints 

function normalizeTexture (texture, width, height) {
    let result = new Uint8Array(texture.length);
    let id = 0;
    for (let i = height - 1; i >= 0; i--) {
        for (let j = 0; j < width; j++) {
            let nid = i * width * 4 + j * 4;
            result[nid + 0] = clamp01(texture[id + 0]) * 255;
            result[nid + 1] = clamp01(texture[id + 1]) * 255;
            result[nid + 2] = clamp01(texture[id + 2]) * 255;
            result[nid + 3] = clamp01(texture[id + 3]) * 255;
            id += 4;
        }
    }
    return result;
}

function clamp01 (input) {
    return Math.min(Math.max(input, 0), 1);
}


function textureToCanvas (texture, width, height) {
    let captureCanvas = document.createElement('canvas');
    let ctx = captureCanvas.getContext('2d');
    captureCanvas.width = width;
    captureCanvas.height = height;
    //createImageData comes from the canvas 2d api
    let imageData = ctx.createImageData(width, height);
    //set data with our texture 
    imageData.data.set(texture);
    //render texture to canvas
    ctx.putImageData(imageData, 0, 0);

    return captureCanvas;
}

function downloadURI (filename, uri) {
    let link = document.createElement('a');
    link.download = filename;
    link.href = uri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

