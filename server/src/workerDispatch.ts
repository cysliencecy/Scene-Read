type FormalWorkerArgumentsInput = {
  taskId: string;
  apiUrl: string;
  maxImages: string;
  environment: NodeJS.ProcessEnv;
};

export function shouldAutoRunWorker(environment: NodeJS.ProcessEnv): boolean {
  return environment.WORKER_AUTO_RUN === 'true';
}

export function buildFormalWorkerArguments({
  taskId,
  apiUrl,
  maxImages,
}: FormalWorkerArgumentsInput): string[] {
  return [
    '-m',
    'scene_reader_worker',
    '--task-id',
    taskId,
    '--api-url',
    apiUrl,
    '--provider',
    'openai',
    '--generate-images',
    '--image-provider',
    'glm',
    '--max-images',
    maxImages,
  ];
}
