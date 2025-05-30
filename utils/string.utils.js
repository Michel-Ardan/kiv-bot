function normalizeTitle(title) {
    return title
      .toLowerCase() // Convert to lowercase
      .replace(/[^a-z0-9\s]/g, "") // Remove non-alphanumeric characters (except spaces)
      .replace(/\s+/g, " ") // Remove extra spaces
      .trim(); // Trim leading/trailing spaces
  }
  
  
  module.exports = {normalizeTitle};