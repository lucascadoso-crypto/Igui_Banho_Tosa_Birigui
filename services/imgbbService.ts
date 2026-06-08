
const IMGBB_API_KEY = (import.meta as any).env.VITE_IMGBB_API_KEY || '';

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

/**
 * Faz o upload de um arquivo para o ImgBB e retorna a URL pública.
 * @param file O arquivo de imagem (File object)
 * @returns A URL da imagem hospedada ou null em caso de erro.
 */
export const uploadToImgBB = async (file: File): Promise<string | null> => {
  if (!IMGBB_API_KEY) {
    console.error('VITE_IMGBB_API_KEY nao configurada. Upload de imagem desabilitado.');
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
      console.error('Erro na resposta do ImgBB:', response.status, errorData);
      return null;
    }

    const result: ImgBBResponse = await response.json();
    if (result.success) {
      return result.data.url;
    } else {
      console.error('Erro no processamento do ImgBB:', result);
      return null;
    }
  } catch (error: any) {
    if (error.message === 'Failed to fetch') {
      console.error('Erro de Rede: Não foi possível alcançar o servidor do ImgBB. Verifique bloqueadores de anúncios ou conexão.');
    } else {
      console.error('Erro de rede ao subir imagem:', error);
    }
    return null;
  }
};
