const IMGBB_API_KEY = (import.meta as any).env.VITE_IMGBB_API_KEY || '';

let lastImgBBUploadError = '';

export interface ImgBBResponse {
  data: {
    url: string;
    delete_url: string;
    thumb: {
      url: string;
    };
  };
  success: boolean;
  status: number;
}

const allowedMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/webp',
]);

export const getLastImgBBUploadError = () => lastImgBBUploadError;

export const uploadToImgBB = async (file: File): Promise<string | null> => {
  lastImgBBUploadError = '';

  if (!IMGBB_API_KEY) {
    lastImgBBUploadError = 'Chave do ImgBB nao configurada. Defina VITE_IMGBB_API_KEY na Vercel.';
    console.error(lastImgBBUploadError);
    return null;
  }

  if (!allowedMimeTypes.has(file.type)) {
    lastImgBBUploadError = 'Formato invalido. Envie PNG, JPG, JPEG, SVG ou WEBP.';
    console.error(lastImgBBUploadError, file.type);
    return null;
  }

  if (file.size > 10 * 1024 * 1024) {
    lastImgBBUploadError = 'Imagem muito grande. Envie um arquivo com ate 10 MB.';
    console.error(lastImgBBUploadError);
    return null;
  }

  const formData = new FormData();
  formData.append('image', file);

  try {
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      lastImgBBUploadError = errorData?.error?.message || 'ImgBB recusou o upload. Verifique a chave e o formato da imagem.';
      console.error('Erro na resposta do ImgBB:', response.status, errorData);
      return null;
    }

    const result: ImgBBResponse = await response.json();
    if (result.success && result.data?.url) {
      return result.data.url;
    }

    lastImgBBUploadError = 'ImgBB nao retornou uma URL publica para a imagem.';
    console.error('Erro no processamento do ImgBB:', result);
    return null;
  } catch (error: any) {
    if (error.message === 'Failed to fetch') {
      lastImgBBUploadError = 'Nao foi possivel conectar ao ImgBB. Verifique a internet, bloqueadores ou CORS.';
    } else {
      lastImgBBUploadError = error.message || 'Erro inesperado ao enviar imagem para o ImgBB.';
    }
    console.error('Erro de rede ao subir imagem:', error);
    return null;
  }
};
