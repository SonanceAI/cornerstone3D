export function setNewAttributesIfValid(attributes, svgNode) {
  Object.keys(attributes).forEach((key) => {
    const newValue = attributes[key];
    if (newValue !== undefined && newValue !== '' && newValue !== 'NaN') {
      svgNode.setAttribute(key, newValue);
    }
  });
}

export default setNewAttributesIfValid;
