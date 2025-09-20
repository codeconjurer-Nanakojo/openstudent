// ImageKit initialization and utility functions

// Validate environment variables
const imagekitUrl = import.meta.env.VITE_IMAGEKIT_URL;
const imagekitPublicKey = import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY;

if (!imagekitUrl || !imagekitPublicKey) {
  console.error('❌ Missing ImageKit environment variables');
  throw new Error('ImageKit configuration incomplete. Check environment variables.');
}

console.log('🖼️ ImageKit configuration loaded');

/**
 * Upload an image to ImageKit
 * @param {File} file - The image file to upload
 * @returns {Promise<{success: boolean, url?: string, message: string}>}
 */
export const uploadImage = async (file) => {
  console.log('📤 Uploading image to ImageKit...');

  try {
    // Validate file
    if (!file || !(file instanceof File)) {
      console.log('❌ Invalid file provided');
      return { success: false, message: 'Please select a valid image file' };
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      console.log('❌ Invalid file type:', file.type);
      return { success: false, message: 'Please select an image file (JPEG, PNG, GIF, etc.)' };
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      console.log('❌ File too large:', file.size);
      return { success: false, message: 'Image must be smaller than 5MB' };
    }

    // Get authentication parameters from server (to avoid exposing private keys)
    console.log('🔐 Getting authentication parameters from server...');

    let authParams;
    try {
      // This endpoint should be implemented on your server
      const response = await fetch('/api/imagekit-auth');

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      authParams = await response.json();
      console.log('✅ Authentication parameters received');
    } catch (error) {
      console.error('❌ Failed to get authentication parameters:', error);
      return {
        success: false,
        message: 'Failed to initialize image upload. Please try again.'
      };
    }

    // Create form data for upload
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', `profile_${Date.now()}_${file.name}`);
    formData.append('publicKey', imagekitPublicKey);
    formData.append('signature', authParams.signature);
    formData.append('expire', authParams.expire);
    formData.append('token', authParams.token);

    // Upload to ImageKit
    console.log('🚀 Uploading file to ImageKit...');
    const uploadResponse = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json();
      console.error('❌ ImageKit upload failed:', errorData);
      return {
        success: false,
        message: 'Failed to upload image. Please try again.'
      };
    }

    const uploadData = await uploadResponse.json();
    console.log('✅ Image uploaded successfully:', uploadData.url);

    return {
      success: true,
      url: uploadData.url,
      message: 'Image uploaded successfully'
    };

  } catch (error) {
    console.error('💥 Unexpected error uploading image:', error);
    return {
      success: false,
      message: 'An unexpected error occurred during upload'
    };
  }
};

console.log('📦 ImageKit module loaded successfully');