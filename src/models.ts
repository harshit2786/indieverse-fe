


export interface Dimensions {
  width: number;
  height: number;
}

export interface Mask {
  segmentation: string;
  area: number;
  bbox: number[];
  point_coords: number[][];
}

export interface ImageData {
    width: number;
    height: number;
    masks: Mask[];
}