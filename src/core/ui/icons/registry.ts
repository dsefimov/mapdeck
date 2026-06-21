const iconRegistry = {
    zoom: new URL("./zoom.svg", import.meta.url).href,
    raster: new URL("./raster.svg", import.meta.url).href,
    vector: new URL("./vector.svg", import.meta.url).href,
    "point-cloud": new URL("./point-cloud.svg", import.meta.url).href,
    report: new URL("./report.svg", import.meta.url).href,
    collapsed: new URL("./collapsed.svg", import.meta.url).href,
    "not-collapsed": new URL("./not-collapsed.svg", import.meta.url).href,
    layers: new URL("./layers.svg", import.meta.url).href,
    map: new URL("./map.svg", import.meta.url).href,
    settings: new URL("./settings.svg", import.meta.url).href,
    refresh: new URL("./refresh.svg", import.meta.url).href,
    ruler: new URL("./ruler.svg", import.meta.url).href,
    area: new URL("./area.svg", import.meta.url).href,
    volume: new URL("./volume.svg", import.meta.url).href,
    compass: new URL("./compass.svg", import.meta.url).href,
    info: new URL("./info.svg", import.meta.url).href,
    "attribute-table": new URL("./attribute-table.svg", import.meta.url).href,
    "settings-sliders": new URL("./settings-sliders.svg", import.meta.url).href,
    "file-download": new URL("./file-download.svg", import.meta.url).href,
} as const;

export type IconName = keyof typeof iconRegistry;

export default iconRegistry;
