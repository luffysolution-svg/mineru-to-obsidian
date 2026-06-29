import { TFile } from "obsidian";
import type { PluginSettings } from "../settings";

/** A single image extracted from a parsed document. */
export interface ParsedImage {
	/** Original name/path as referenced inside the markdown (e.g. "images/abc.jpg"). */
	originalRef: string;
	/** Binary data of the image. */
	data: ArrayBuffer;
}

/** Result of parsing one document. */
export interface ParseResult {
	/** The markdown body. Image links still point to `ParsedImage.originalRef`. */
	markdown: string;
	/** Extracted images. May be empty (free mode / markitdown). */
	images: ParsedImage[];
}

/** A parsing backend (MinerU / markitdown). */
export interface Parser {
	id: ParserId;
	/** Human label for notices. */
	label: string;
	/**
	 * Parse a vault file into markdown + images.
	 * Should throw an Error with a user-readable message on failure.
	 */
	parse(file: TFile, settings: PluginSettings): Promise<ParseResult>;
}

export type ParserId = "mineru" | "markitdown";

/** File extensions the plugin offers to parse. */
export const SUPPORTED_EXTENSIONS = [
	"pdf",
	"doc",
	"docx",
	"ppt",
	"pptx",
	"xls",
	"xlsx",
	"png",
	"jpg",
	"jpeg",
	"jp2",
	"webp",
	"gif",
	"bmp",
	"html",
];
