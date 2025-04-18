import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import type { InitializedOperationData } from '../BrushStrategy';
import type BoundsIJK from '../../../../types/BoundsIJK';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';

/**
 * Initializes the threshold values for the dynamic threshold.
 * If the threshold is undefined/null, the threshold will be set
 * by looking at the area centered on the centerIJK, with a delta radius,
 * and taking the range of those pixel values.
 * If the threshold is already set, then the range will be extended by just the
 * center voxel at centerIJK.
 */
export default {
  [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
    const {
      operationName,
      centerIJK,
      strategySpecificConfiguration,
      segmentationVoxelManager,
      imageVoxelManager,
      segmentIndex,
      viewport,
    } = operationData;
    const { THRESHOLD } = strategySpecificConfiguration;

    if (!THRESHOLD?.isDynamic || !centerIJK || !segmentIndex) {
      return;
    }
    if (
      operationName === StrategyCallbacks.RejectPreview ||
      operationName === StrategyCallbacks.OnInteractionEnd
    ) {
      return;
    }

    const boundsIJK = segmentationVoxelManager.getBoundsIJK();
    const { threshold: oldThreshold, dynamicRadius = 0 } = THRESHOLD;
    const useDelta = oldThreshold ? 0 : dynamicRadius;
    const { viewPlaneNormal } = viewport.getCamera();

    const nestedBounds = boundsIJK.map((ijk, idx) => {
      const [min, max] = ijk;
      return [
        Math.max(min, centerIJK[idx] - useDelta),
        Math.min(max, centerIJK[idx] + useDelta),
      ];
    }) as BoundsIJK;
    // Squash the bounds to the plane in view when it is orthogonal, or close
    // to orthogonal to one of the bounding planes.
    // Otherwise just use the full area for now.
    if (Math.abs(viewPlaneNormal[0]) > 0.8) {
      nestedBounds[0] = [centerIJK[0], centerIJK[0]];
    } else if (Math.abs(viewPlaneNormal[1]) > 0.8) {
      nestedBounds[1] = [centerIJK[1], centerIJK[1]];
    } else if (Math.abs(viewPlaneNormal[2]) > 0.8) {
      nestedBounds[2] = [centerIJK[2], centerIJK[2]];
    }

    const threshold = oldThreshold || [Infinity, -Infinity];
    // TODO - threshold on all three values separately
    const useDeltaSqr = useDelta * useDelta;
    const callback = ({ value, pointIJK }) => {
      const distance = vec3.sqrDist(centerIJK, pointIJK);
      if (distance > useDeltaSqr) {
        return;
      }
      // @ts-ignore
      const gray = Array.isArray(value) ? vec3.len(value) : value;
      threshold[0] = Math.min(gray, threshold[0]);
      threshold[1] = Math.max(gray, threshold[1]);
    };
    imageVoxelManager.forEach(callback, { boundsIJK: nestedBounds });

    operationData.strategySpecificConfiguration.THRESHOLD.threshold = threshold;
  },
  // Setup a clear threshold value on mouse/touch down
  [StrategyCallbacks.OnInteractionStart]: (
    operationData: InitializedOperationData
  ) => {
    const { strategySpecificConfiguration, preview } = operationData;
    if (!strategySpecificConfiguration?.THRESHOLD?.isDynamic && !preview) {
      return;
    }
    strategySpecificConfiguration.THRESHOLD.threshold = null;
  },
  /**
   * It computes the inner circle radius in canvas coordinates and stores it
   * in the strategySpecificConfiguration. This is used to show the user
   * the area that is used to compute the threshold.
   */
  [StrategyCallbacks.ComputeInnerCircleRadius]: (
    operationData: InitializedOperationData
  ) => {
    const { configuration, viewport } = operationData;
    const { THRESHOLD: { dynamicRadius = 0 } = {} } =
      configuration.strategySpecificConfiguration || {};

    if (dynamicRadius === 0) {
      return;
    }

    // @ts-ignore
    const imageData = viewport.getImageData();

    if (!imageData) {
      return;
    }

    const { spacing } = imageData;
    const centerCanvas = [
      viewport.element.clientWidth / 2,
      viewport.element.clientHeight / 2,
    ] as Types.Point2;
    const radiusInWorld = dynamicRadius * spacing[0];
    const centerCursorInWorld = viewport.canvasToWorld(centerCanvas);

    const offSetCenterInWorld = centerCursorInWorld.map(
      (coord) => coord + radiusInWorld
    ) as Types.Point3;

    const offSetCenterCanvas = viewport.worldToCanvas(offSetCenterInWorld);
    const dynamicRadiusInCanvas = Math.abs(
      centerCanvas[0] - offSetCenterCanvas[0]
    );

    // this is a bit of a hack, since we have switched to using THRESHOLD
    // as strategy but really strategy names are CIRCLE_THRESHOLD and SPHERE_THRESHOLD
    // and we can't really change the name of the strategy in the configuration
    const { strategySpecificConfiguration, activeStrategy } = configuration;

    if (!strategySpecificConfiguration[activeStrategy]) {
      strategySpecificConfiguration[activeStrategy] = {};
    }

    // Add a couple of pixels to the radius to make it more obvious what is
    // included.
    strategySpecificConfiguration[activeStrategy].dynamicRadiusInCanvas =
      3 + dynamicRadiusInCanvas;
  },
};
