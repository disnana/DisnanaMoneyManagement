const { withAppBuildGradle } = require('expo/config-plugins');

const materialConstraint = `
dependencies {
    constraints {
        implementation('com.google.android.material:material:1.14.0') {
            version { strictly '1.14.0' }
        }
    }
}
`;

module.exports = function withAndroidMaterialVersion(config) {
  return withAppBuildGradle(config, (result) => {
    const gradle = result.modResults;
    if (gradle.language !== 'groovy') {
      throw new Error('The Android Material version constraint requires a Groovy app build.gradle');
    }
    if (!gradle.contents.includes(materialConstraint)) {
      gradle.contents += materialConstraint;
    }
    return result;
  });
};
