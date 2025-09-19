// Import Supabase client (add this at the top)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/supabase-browser.min.js'

// Initialize Supabase client
const supabaseUrl = 'https://rafldympeqicehnleojk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhZmxkeW1wZXFpY2Vobmxlb2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMTcxMjMsImV4cCI6MjA3MzY5MzEyM30.PJbyazF2R71EkkXwefeQ0rhooOxyE5ETKcVojPrQM7Q';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Listen for authentication state changes
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth state changed:', event, session);
  // You can add custom logic here for handling auth changes
});

// Database utility functions
const DatabaseUtils = {
    // ... (your existing functions remain the same) ...

    // Additional utility function for handling file uploads
    async uploadFile(bucketName, filePath, file) {
        try {
            const { data, error } = await supabase
                .storage
                .from(bucketName)
                .upload(filePath, file);

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error uploading file:', error);
            throw error;
        }
    },

    // Additional utility function for subscribing to real-time changes
    subscribeToTable(tableName, callback) {
        return supabase
            .channel('custom-channels')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: tableName
                },
                callback
            )
            .subscribe();
    }
};

// Make utilities available globally
window.DatabaseUtils = DatabaseUtils;
window.supabase = supabase;

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { supabase, DatabaseUtils };
}