import Asset from "../models/assetModel.js";
import { created, ok } from "../utils/response.js";

export const createAsset = async (req, res, next) => {
  try {
    const { symbol, name, type } = req.body;
    const asset = await Asset.create({ symbol, name, type });
    created(res, asset, "Asset created");
  } catch (err) {
    next(err);
  }
};

export const getAssets = async (req, res, next) => {
  try {
    const assets = await Asset.find();
    ok(res, assets, "Assets fetched");
  } catch (err) {
    next(err);
  }
};
