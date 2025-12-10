/**
 * Handler for GET /resources/{id}
 */

import { findById } from '../database-manager.js';

/**
 * Create get-by-id handler for a resource
 * @param {Object} apiMetadata - API metadata from OpenAPI spec
 * @param {Object} endpoint - Endpoint metadata
 * @returns {Function} Express handler
 */
export function createGetHandler(apiMetadata, endpoint) {
  return (req, res) => {
    try {
      const paramMatch = endpoint.path.match(/\{(\w+)\}/);
      const paramName = paramMatch ? paramMatch[1] : 'id';
      const resourceId = req.params[paramName];
      
      const resource = findById(apiMetadata.name, resourceId);
      
      if (!resource) {
        const singularName = apiMetadata.name.endsWith('s')
          ? apiMetadata.name.slice(0, -1)
          : apiMetadata.name;
        return res.status(404).json({
          code: 'NOT_FOUND',
          message: `${capitalize(singularName)} not found`
        });
      }
      
      res.json(resource);
    } catch (error) {
      console.error('Get handler error:', error);
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: [{ message: error.message }]
      });
    }
  };
}

/**
 * Capitalize first letter of a string
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
