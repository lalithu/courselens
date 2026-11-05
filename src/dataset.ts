const directory = import.meta.env.VITE_COURSELENS_DATA === 'data' ? 'data' : 'demo-data';

export function datasetFile(path: string) {
  return new URL(directory + '/' + path, new URL(import.meta.env.BASE_URL, window.location.href)).href;
}

export const datasetLabel = directory === 'data' ? 'Simulated CS1 research traces' : 'Synthetic CS1 demo';
