import {
    Configuration,
    EventsApi,
    CreateEventSchemaRequest,
    UsageMetersApi,
    CreateUsageMeterRequest,
    CreateUsageMeterRequestTypeEnum,
    CreateUsageMeterRequestAggregationEnum,
    PricePlansApi,
    CreatePricePlanRequest,
    PricingCycleIntervalEnum,
    PricingCycleStartTypeEnum,
    RateCardTypeEnum,
    RateCardUsageValueRateStrategyEnum,
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
} from "togai-client";

const API_KEY = "YOUR_API_KEY";
const configuration = new Configuration({
    basePath: "https://sandbox-api.togai.com",
    accessToken: API_KEY,
});

// The eample here is Twilio charging its customers based on country and message sent usage.
// Follow the steps below to create the required entities in Togai, and then ingest an event.

async function sample() {
    // Step 1: Create an Event Schema to define the event structure, attributes (can be usage value) and dimensions (can be used filters in usage meters i.e country in this case)
    const eventSchemaApi = new EventsApi(configuration);
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
        name: "messages",
        type: CreateUsageMeterRequestTypeEnum.Counter,
        // The filters are written in Json Logic format
        filters: `{
            "==": [
                {
                    "var": "dimensions.country"
                },
                "US"
            ]
        }`,
        aggregation: CreateUsageMeterRequestAggregationEnum.Count,
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
        pricingCycle: {
            interval: PricingCycleIntervalEnum.Monthly,
            startType: PricingCycleStartTypeEnum.Static,
            startOffset: {
                dayOffset: "1",
                monthOffset: "NIL"
            },
            gracePeriod: 1,
        },
        rateCard: {
            type: RateCardTypeEnum.Usage,
            usageConfig: {
                [usageMeter.name]: {
                    name: "rate-card",
                    rateStrategy: RateCardUsageValueRateStrategyEnum.PerUnit,
                    slabStrategy: "TIER",
                    slabs: [
                        {
                            rate: 0.2,
                            startAfter: 0.0,
                            order: 1,
                        },
                        {
                            rate: 0.5,
                            startAfter: 10000.0,
                            order: 2,
                        },
                    ],
                },
            },
        },
    };
    const pricePlanApi = new PricePlansApi(configuration);
    const pricePlan = (
        await pricePlanApi.createPricePlan(createPricePlanRequest)
    ).data;
    console.log("Price Plan created", pricePlan);

    // Step 6: Activate the Price Plan
    await pricePlanApi.activatePricePlan(pricePlan.name);

    // Step 7: Create customers to associte events and price to a particular customer and get monthly bill value
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
        effectiveFrom: new Date().toISOString().substring(0, 10)
    }
    const associatePricePlanApi = new AccountsApi(configuration);
    const associatePricePlan = (await associatePricePlanApi.associatePricePlan(customer.id, customer.id, associatePricePlanRequest)).data;
    console.log("Price Plan associated", associatePricePlan);

    //Step 9: Ingest events
    const eventsApi = new EventIngestionApi(configuration);
    const eventRequest:IngestEventRequest = {
        event: {
            id: "random-string" + Math.random(),
            eventName: eventSchema.name,
            eventTimestamp: new Date().toISOString(),
            accountId: customer.id,
            eventAttributes: [{
                attributeName: "sms_id",
                attributeValue: "random-string" + Math.random()
            }],
            dimensions: {
                "country": "US"
            }
        }
    }
    const event = await eventsApi.ingest(eventRequest)
    console.log("Event ingested", event);

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
    //You can call the api after 15 minutes of ingestion to get the accurate revenue metrics
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
}

sample();
