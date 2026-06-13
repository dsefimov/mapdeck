/**
 * STAC Pointcloud Extension types
 * @see https://github.com/stac-extensions/pointcloud
 */

export const POINTCLOUD_SCHEMA =
    "https://stac-extensions.github.io/pointcloud/v1.0.0/schema.json";

export interface PointcloudSchema {
    readonly name: string;
    readonly size: number;
    readonly type: "floating" | "unsigned" | "signed";
}

export interface PointcloudStatistic {
    readonly average?: number;
    readonly count?: number;
    readonly maximum?: number;
    readonly minimum?: number;
    readonly name: string;
    readonly position?: number;
    readonly stddev?: number;
    readonly variance?: number;
}

export interface PointcloudItemFields {
    readonly "pc:count"?: number;
    readonly "pc:type"?:
        | "lidar"
        | "eopc"
        | "sonar"
        | "radar"
        | "other"
        | string;
    readonly "pc:encoding"?: "LASzip" | "COPC" | string;
    readonly "pc:schemas"?: PointcloudSchema[];
    readonly "pc:statistics"?: PointcloudStatistic[];
    readonly "pc:density"?: number;
}

/** MIME types commonly associated with point cloud data */
export const POINTCLOUD_MIMES = new Set([
    "application/vnd.laszip",
    "application/vnd.copc",
    // application/octet-stream is intentionally excluded — too broad.
    // It is handled separately in PointCloudRoleResolver with pc:encoding check.
]);
