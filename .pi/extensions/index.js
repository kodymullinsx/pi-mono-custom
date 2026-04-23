/**
 * Root package entry point for the project-local extensions bundle.
 *
 * Pi discovers the real child extensions through the `pi.extensions` manifest
 * in this directory's package.json. This file exists so the package itself has
 * a valid main entry when tools inspect or require the directory directly.
 */

module.exports = function extensionsPackageEntry() {
  // Intentionally empty. Child extensions are declared in package.json -> pi.extensions.
};
