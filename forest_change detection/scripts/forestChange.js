var aoi = homaBay;  
Map.centerObject(aoi, 9);
Map.addLayer(aoi, {color: 'red'}, 'AOI');

// Merge the training areas for each class
var allTrainingData = Forest.merge(Water_body).merge(Bareland)
                              .merge(Agricuture_other_vegetations)
                              .merge(Built_up)
                            
 
// Load CSV training data
var trainingData = ee.FeatureCollection("projects/ee-johnwhitte/assets/training_sample_1");

// Function to preprocess Landsat images
function preprocessImage(year) {
    var image = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
                .filterDate(year + '-01-01', year + '-12-31')
                .filterBounds(aoi)
                .filterMetadata("CLOUD_COVER", "less_than", 10)
                .map(function(img) {
                    return img.clip(aoi);
                })
                .median()
                .select(['SR_B4', 'SR_B5', 'SR_B6']); // Red, Green, Blue bands
    return image;
}

// Preprocess images for each year
var image2013 = preprocessImage(2013);
var image2015 = preprocessImage(2015);
var image2020 = preprocessImage(2020);
var image2024 = preprocessImage(2024);

// Display the images
Map.addLayer(image2013, {min: 0, max: 3000, bands: ['SR_B4', 'SR_B5', 'SR_B6']}, '2013 Image');
Map.addLayer(image2015, {min: 0, max: 3000, bands: ['SR_B4', 'SR_B5', 'SR_B6']}, '2015 Image');
Map.addLayer(image2020, {min: 0, max: 3000, bands: ['SR_B4', 'SR_B5', 'SR_B6']}, '2020 Image');
Map.addLayer(image2024, {min: 0, max: 3000, bands: ['SR_B4', 'SR_B5', 'SR_B6']}, '2024 Image');

// Split training data into training and validation subsets
var withRandom = trainingData.randomColumn('random');
var trainingSet = withRandom.filter(ee.Filter.lt('random', 0.7)); // 70% for training
var validationSet = withRandom.filter(ee.Filter.gte('random', 0.7)); // 30% for validation

// Train classifier using training subset
var trainedClassifier = ee.Classifier.smileRandomForest(10).train({
    features: trainingSet,
    classProperty: 'class',
    inputProperties: ['SR_B4', 'SR_B5', 'SR_B6']
});

// Classify validation dataset
var validated = validationSet.classify(trainedClassifier);

// Generate confusion matrix
var confusionMatrix = validated.errorMatrix('class', 'classification');

// Print confusion matrix
print('Confusion Matrix:', confusionMatrix);

// Compute accuracy metrics
var overallAccuracy = confusionMatrix.accuracy();
var producersAccuracy = confusionMatrix.producersAccuracy();
var usersAccuracy = confusionMatrix.consumersAccuracy();
var kappaAccuracy = confusionMatrix.kappa(); // Calculate Kappa's accuracy

// Print accuracy metrics
print('Overall Accuracy:', overallAccuracy);
print('Producer\'s Accuracy:', producersAccuracy);
print('User\'s Accuracy:', usersAccuracy);
print('Kappa Accuracy:', kappaAccuracy);

// Use the trained classifier for image classification
var classifier = trainedClassifier;

function classifyImage(image) {
    return image.classify(classifier);
}

// Classify each image
var classified2013 = classifyImage(image2013);
var classified2015 = classifyImage(image2015);
var classified2020 = classifyImage(image2020);
var classified2024 = classifyImage(image2024);

// Add classification layers with legend
var landcoverPalette = ['006400', '2328C6', 'A52A2A', '7FFF00', 'C0C0C0']; // Adjust colors for classes
Map.addLayer(classified2013, {min: 0, max: 4, palette: landcoverPalette}, 'Classified 2013');
Map.addLayer(classified2015, {min: 0, max: 4, palette: landcoverPalette}, 'Classified 2015');
Map.addLayer(classified2020, {min: 0, max: 4, palette: landcoverPalette}, 'Classified 2020');
Map.addLayer(classified2024, {min: 0, max: 4, palette: landcoverPalette}, 'Classified 2024');

// Function to calculate class area (in hectares)
function calculateClassArea(classifiedImage, classNumber) {
    var classMask = classifiedImage.eq(classNumber); // Mask for the specific class
    var areaImage = classMask.multiply(ee.Image.pixelArea()).divide(10000); // Convert to hectares
    var areaStats = areaImage.reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: aoi,
        scale: 30,
        maxPixels: 1e8
    });
    return areaStats;
}

// Compute area for each class for each year
var classAreas2013 = {};
var classAreas2015 = {};
var classAreas2020 = {};
var classAreas2024 = {};

for (var classNumber = 0; classNumber <= 4; classNumber++) {
    classAreas2013[classNumber] = calculateClassArea(classified2013, classNumber);
    classAreas2015[classNumber] = calculateClassArea(classified2015, classNumber);
    classAreas2020[classNumber] = calculateClassArea(classified2020, classNumber);
    classAreas2024[classNumber] = calculateClassArea(classified2024, classNumber);
}

// Display the calculated class areas in hectares for each year (all classes)
for (var classNumber = 0; classNumber <= 4; classNumber++) {
    print('Class ' + classNumber + ' area in 2013 (ha):', classAreas2013[classNumber]);
    print('Class ' + classNumber + ' area in 2015 (ha):', classAreas2015[classNumber]);
    print('Class ' + classNumber + ' area in 2020 (ha):', classAreas2020[classNumber]);
    print('Class ' + classNumber + ' area in 2024 (ha):', classAreas2024[classNumber]);
}

// Function to calculate forest area change for the forest class (class 0)
function calculateForestAreaChange(initialClassified, finalClassified) {
    // Calculate area for initial and final classified images for the Forest class (class 0)
    var initialArea = calculateClassArea(initialClassified, 0);
    var finalArea = calculateClassArea(finalClassified, 0);

    // Extract the 'sum' value from the area calculation
    var initialSum = ee.Number(initialArea.get('sum'));
    var finalSum = ee.Number(finalArea.get('sum'));

    // Compute the area change (final area - initial area)
    var areaChange = finalSum.subtract(initialSum); 

    return areaChange;
}

// Calculate forest area change for each period (2013-2015, 2015-2020, 2020-2024)
var change1315 = calculateForestAreaChange(classified2013, classified2015);
var change1520 = calculateForestAreaChange(classified2015, classified2020);
var change2024 = calculateForestAreaChange(classified2020, classified2024);

// Display forest area change results
print('Forest area change from 2013 to 2015 (ha):', change1315);
print('Forest area change from 2015 to 2020 (ha):', change1520);
print('Forest area change from 2020 to 2024 (ha):', change2024);

// Function to add legends
function addLegend(title, palette, names) {
    var legend = ui.Panel({
        style: {
            position: 'bottom-left',
            padding: '8px 15px'
        }
    });

    var legendTitle = ui.Label({
        value: title,
        style: {fontWeight: 'bold', fontSize: '16px', margin: '0 0 4px 0'}
    });
    legend.add(legendTitle);

    for (var i = 0; i < names.length; i++) {
        var colorBox = ui.Label({
            style: {
                backgroundColor: '#' + palette[i],
                padding: '8px',
                margin: '0 0 4px 0'
            }
        });
        var description = ui.Label({
            value: names[i],
            style: {margin: '0 0 4px 6px'}
        });

        var row = ui.Panel({
            widgets: [colorBox, description],
            layout: ui.Panel.Layout.Flow('horizontal')
        });
        legend.add(row);
    }
    Map.add(legend);
}

// Define class names and add legends
var classNames = ['Forest', 'Water Body', 'Bareland', 'Other Vegetations', 'Built-up'];
addLegend('Land Cover Classes', landcoverPalette, classNames);

// Define the bands to use for training (e.g., Red, Green, Blue, and Near Infrared bands)
var bands = ['SR_B6', 'SR_B5', 'SR_B4']; // Use SR_B4 for Red, SR_B3 for Green, SR_B2 for Blue, and SR_B5 for NIR

 // Training data sampling: sample the regions from the image for the given classes
var trainingSample = image2015.select(bands).sampleRegions({
  collection: allTrainingData.limit(500),  // Limit to 500 points for training
  properties: ['class'],  // The class property to be predicted
  scale: 30  // Set a scale of 30m (for Landsat imagery)
});

// Export the training sample to Google Drive
Export.table.toDrive({
  collection: trainingSample,
  description: 'My_Training_Sample_1',
  fileFormat: 'CSV'  // You can also export as GeoJSON if you prefer
});