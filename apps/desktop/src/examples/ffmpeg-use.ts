import { runFfmpeg } from "../tauri-ffmpeg";

async function exportConcat(inputPaths: string[], outputPath: string) {
  // Example concating using ffmpeg CLI with a temporary file list
  // For simple concat of same codec files:
  // ffmpeg -f concat -safe 0 -i filelist.txt -c copy out.mp4
  // You will need to write the filelist.txt via Tauri fs APIs or create an argument list accordingly.

  // Simplest direct spawn example:
  const args = [
    "-i",
    inputPaths[0], // simple single input example; replace with real args
    "-c",
    "copy",
    outputPath,
  ];

  await runFfmpeg(args, (line) => {
    console.log("ffmpeg:", line);
  });
}
