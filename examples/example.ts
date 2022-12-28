import {
    Configuration,
    EventSchemasApi,
    CreateEventSchemaRequest,
    UsageMetersApi,
    CreateUsageMeterRequest,
    CreateUsageMeterRequestTypeEnum,
    CreateUsageMeterRequestAggregationEnum,
    PricePlansApi,
    CreatePricePlanRequest,
    CreateCustomerRequest,
    CustomersApi,
    AssociatePricePlanRequest,
    AccountsApi,
    EventIngestionApi,
    IngestEventRequest,
    MetricsApi,
    GetMetricsRequest,
    MetricQueryAggregationPeriodEnum,
    MetricName,
    PricingCycleConfigIntervalEnum,
    PricingCycleConfigStartTypeEnum,
    PricingModel,
    PriceType,
} from "togai-client";

const API_TOKEN = "YOUR API TOKEN"; 
const BASE_PATH = "https://sandbox-api.togai.com"

const configuration = new Configuration({
    basePath: BASE_PATH,
    accessToken: API_TOKEN,
});

// Following example simulates the pricing of an API based SMS service which charges their customers based on region and size of the message.
// Follow the steps below to create the required entities in Togai, and then ingest an event.

async function sample() {
    // Step 1: Create an Event Schema to define the event structure, attributes (can be usage value) and dimensions (can be used filters in usage meters i.e country in this case)
    const eventSchemaApi = new EventSchemasApi(configuration);
    const createEventSchemaRequest: CreateEventSchemaRequest = {
        name: "message_sent",
        attributes: [
            {
                name: "sms_id"
            },
        ],
        dimensions: [
            {
                name: "country",
            },
        ],
    };
    const eventSchema = (
        await eventSchemaApi.createEventSchema(createEventSchemaRequest)
    ).data;
    console.log("Event Schema created", eventSchema);

    // Step 2: Activate the Event Schema
    await eventSchemaApi.activateEventSchema(eventSchema.name);

    // Step 3: Create a Usage Meter to meter the usage with aggregation methods
    const createUsageMeterRequest: CreateUsageMeterRequest = {
        name: "message_count",
        type: CreateUsageMeterRequestTypeEnum.Counter,
        aggregation: CreateUsageMeterRequestAggregationEnum.Count,
        computations: [
            {
                // The filters are written in Json Logic format
                matcher: `{
                    "==": [
                        {
                            "var": "dimensions.country"
                        },
                        "US"
                    ]
                }`,
                computation: `1`
            }
        ]
    };
    const usageMeterApi = new UsageMetersApi(configuration);
    const usageMeter = (
        await usageMeterApi.createUsageMeter(
            eventSchema.name,
            createUsageMeterRequest
        )
    ).data;
    console.log("Usage Meter created", usageMeter);

    // Step 4: Activate a usage meter
    await usageMeterApi.activateUsageMeter(eventSchema.name, usageMeter.name);

    // Step 5: Create a Price plan to convert the usage into a billable price
    const createPricePlanRequest: CreatePricePlanRequest = {
        name: "price-plan",
        pricePlanDetails: {
            pricingCycleConfig: {
                interval: PricingCycleConfigIntervalEnum.Monthly,
                startType: PricingCycleConfigStartTypeEnum.Static,
                startOffset: {
                    dayOffset: "1",
                    monthOffset: "NIL"
                },
                gracePeriod: 1,
            },
            rateCards: [
                {
                    displayName: "sms-charges",
                    pricingModel: PricingModel.Tiered,
                    rateConfig: {
                        usageMeterName: usageMeter.name,
                        slabs: [
                            {
                                rate: 0.2,
                                startAfter: 0.0,
                                priceType: PriceType.PerUnit,
                                order: 1,
                            },
                            {
                                rate: 0.1,
                                startAfter: 10000.0,
                                priceType: PriceType.PerUnit,
                                order: 2,
                            },
                        ]
                    }
                }
            ]
        }
    };
    const pricePlanApi = new PricePlansApi(configuration);
    const pricePlan = (
        await pricePlanApi.createPricePlan(createPricePlanRequest)
    ).data;
    console.log("Price Plan created", pricePlan);

    // Step 6: Activate the Price Plan
    await pricePlanApi.activatePricePlan(pricePlan.name);

    // Step 7: Create customers to associate price plans
    const createCustomerRequest:CreateCustomerRequest = {
        name: "customer1",
        id: "1",
        billingAddress: "address",
        primaryEmail: "email@togai.com"
    } 
    const customersApi = new CustomersApi(configuration);
    const customer = (await customersApi.createCustomer(createCustomerRequest)).data;
    console.log("Customer created", customer);

    // Step 8: Associate the customer/account to the price plan
    const associatePricePlanRequest:AssociatePricePlanRequest = {
        pricePlanName: pricePlan.name,
        effectiveFrom: new Date().toISOString().substring(0, 10),
        effectiveUntil: "9999-01-01"
    }
    const associatePricePlanApi = new AccountsApi(configuration);
    const associatePricePlan = (await associatePricePlanApi.associatePricePlan(customer.id, customer.id, associatePricePlanRequest)).data;
    console.log("Price Plan associated", associatePricePlan);

    //Step 9: Ingest events
    const eventsApi = new EventIngestionApi(configuration);
    const eventRequest:IngestEventRequest = {
        event: {
            id: "random-string" + Math.random(),
            schemaName: eventSchema.name,
            timestamp: new Date().toISOString(),
            accountId: customer.id,
            attributes: [{
                name: "sms_id",
                value: "random-string" + Math.random()
            }],
            dimensions: {
                "country": "US"
            }
        }
    }
    const event = (await eventsApi.ingest(eventRequest)).data
    console.log("Event ingested", event);

    await new Promise(f => setTimeout(f, 60000));

    //Step 10: Get the usage metrics 
    const now = new Date();
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1);

    const metricsApi = new MetricsApi(configuration);
    const usageMetricsRequest:GetMetricsRequest = {
        startTime: yesterday.toISOString(),
        endTime: now.toISOString(),
        metricQueries: [
            {
                id: "usage-metrics",
                name: MetricName.Usage,
                aggregationPeriod: MetricQueryAggregationPeriodEnum.Day
            }
        ]
    }
    const usageMetrics = (await metricsApi.getMetrics(usageMetricsRequest)).data
    console.log("Usage Metrics", JSON.stringify(usageMetrics, null, 2));

    //Step 11: Get the revenue metrics
    //Revenue metrics might take a bit of time to be reflected in the system
    //You can check the docs on the amount of time it takes for events to get processed for revenue.
    const revenueMetricsRequest:GetMetricsRequest = {
        startTime: yesterday.toISOString(),
        endTime: now.toISOString(),
        metricQueries: [
            {
                id: "revenue-metrics",
                name: MetricName.Revenue,
                aggregationPeriod: MetricQueryAggregationPeriodEnum.Day
            }
        ]
    }
    const revenueMetrics = (await metricsApi.getMetrics(revenueMetricsRequest)).data
    console.log("Revenue Metrics", JSON.stringify(revenueMetrics, null, 2));

    // Revenue metrics for a specific customer
    const customerRevenueMetricsRequest:GetMetricsRequest = {
        startTime: yesterday.toISOString(),
        endTime: now.toISOString(),
        metricQueries: [
            {
                id: "customer-revenue-metrics",
                name: MetricName.Revenue,
                aggregationPeriod: MetricQueryAggregationPeriodEnum.Day,
                filters: [
                    {
                        fieldName: "CUSTOMER_ID",
                        fieldValues: [customer.id]
                    }
                ]
            }
        ]
    }
    const customerRevenueMetrics = (await metricsApi.getMetrics(customerRevenueMetricsRequest)).data
    console.log("Customer Revenue Metrics", JSON.stringify(customerRevenueMetrics, null, 2));
}

sample();
